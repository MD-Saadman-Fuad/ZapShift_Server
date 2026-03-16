const express = require('express');
const cors = require('cors');
const app = express();
require('dotenv').config();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const crypto = require("crypto");


const admin = require("firebase-admin");

const serviceAccount = require("./zap-shift-firebase-adminsdk.json");
const { stat } = require('fs');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});


function generateTrackingId() {
    const prefix = "PRCL"; // your brand prefix
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

    return `${prefix}-${date}-${random}`;
}


// Middleware
app.use(express.json());
app.use(cors());

const verifyFBToken = async (req, res, next) => {
    // console.log('headers', req.headers.authorization)
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }


    try {
        const idToken = token.split(' ')[1];
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.decodedEmail = decoded.email;
        next();
    }
    catch (err) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }

};


const uri = `${process.env.URI}`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db("zapShiftDB");
        const usersCollection = db.collection("users");
        const parcelsCollection = db.collection("parcels");
        const paymentCollection = db.collection("payments");
        const ridersCollection = db.collection("riders");
        const trackingsCollection = db.collection("trackings");

        // Middleware to verify admin token
        //always after verifyFBToken

        const verifyAdmin = async (req, res, next) => {
            const email = req.decodedEmail;
            const query = { email };
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            next();
        };
        const verifyRider = async (req, res, next) => {
            const email = req.decodedEmail;
            const query = { email };
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'rider') {
                return res.status(403).send({ message: 'Forbidden access' });
            }
            next();
        };

        const logTracking = async (trackingId, status) => {
            const query = { trackingId, status };
            const log = {
                trackingId,
                status,
                details: status.split('_').join(' '), // Convert status to a more readable format   
                createdAt: new Date(),
            }
            const result = await trackingsCollection.updateOne(
                query,
                { $setOnInsert: log },
                { upsert: true }
            );
            return result;
        };

        //users related API
        app.get('/users', async (req, res) => {
            const searchText = req.query.searchText;
            const query = {};
            if (searchText) {
                // query.name = {$regex: searchText, $options: 'i'};
                query.$or = [
                    { name: { $regex: searchText, $options: 'i' } },
                    { email: { $regex: searchText, $options: 'i' } }
                ]
            }
            const cursor = usersCollection.find(query);
            const users = await cursor.toArray();
            res.send(users);
        });

        app.get('/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.findOne(query);
            res.send(result);
        });

        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            if (user) {
                res.send({ role: user.role });
            } else {
                res.status(404).send({ message: 'User not found' });
            }
        });

        app.post('/users', async (req, res) => {
            const user = req.body;

            user.role = 'user';
            user.createdAt = new Date();

            const userExists = await usersCollection.findOne({ email: user.email });
            if (userExists) {
                return res.status(409).send({ message: 'User already exists' });
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/:id/role', verifyFBToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const roleInfo = req.body.role;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: roleInfo
                }
            }
            const result = await usersCollection.updateOne(query, updatedDoc);
            res.send(result);
        });



        // riders related API
        app.post('/riders', async (req, res) => {
            const rider = req.body;
            rider.status = 'pending';
            rider.createdAt = new Date();
            const result = await ridersCollection.insertOne(rider);
            res.send(result);
        });

        app.patch('/riders/:id', verifyFBToken, verifyAdmin, async (req, res) => {
            const status = req.body.status;
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    status: status,
                    workStatus: 'available'
                }
            }

            const result = await ridersCollection.updateOne(query, updatedDoc);

            if (status === 'approved') {
                const email = req.body.email;
                const userQuery = { email }
                const updateUser = {
                    $set: {
                        role: 'rider'
                    }
                }
                const userResult = await usersCollection.updateOne(userQuery, updateUser);
            }

            res.send(result);
        })

        app.get('/riders', async (req, res) => {
            const { status, district, workStatus } = req.query;
            const query = {};
            if (req.query.status) {
                query.status = status;
            }
            if (req.query.district) {
                query.district = district;
            }
            if (req.query.workStatus) {
                query.workStatus = workStatus;
            }
            const options = { sort: { createdAt: -1 } };
            const cursor = ridersCollection.find(query, options);
            const riders = await cursor.toArray();
            res.send(riders);
        });

        app.get('/riders/delivery-per-day', async (req, res) => {
            const email = req.query.email;
            const pipeline = [
                {
                    $match: {
                        riderEmail: email,
                        deliveryStatus: "parcel_delivered"
                    }
                },
                {
                    $lookup: {
                        from: "trackings",
                        localField: "trackingId",
                        foreignField: "trackingId",
                        as: "parcel_trackings"
                    }
                },
                {
                    $unwind: "$parcel_trackings"
                },
                {
                    $match: {
                        "parcel_trackings.status": "parcel_delivered"
                    }
                },
                {
                    // convert timestamp to YYYY-MM-DD string
                    $addFields: {
                        deliveryDay: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$parcel_trackings.createdAt"
                            }
                        }
                    }
                },
                {
                    // group by date
                    $group: {
                        _id: "$deliveryDay",
                        deliveredCount: { $sum: 1 }
                    }
                }
            ];

            const result = await parcelsCollection.aggregate(pipeline).toArray();
            res.send(result);
        });

        // API to add a parcel
        app.get('/parcels', async (req, res) => {
            const query = {};
            const { email, deliveryStatus } = req.query;
            if (email) {
                query.senderEmail = email;
            }
            if (deliveryStatus) {
                query.deliveryStatus = deliveryStatus;
            }
            const options = { sort: { createdAt: -1 } };
            const cursor = parcelsCollection.find(query, options);
            const parcels = await cursor.toArray();
            res.send(parcels);
        });

        app.get('/parcels/rider', async (req, res) => {
            const { riderEmail, deliveryStatus } = req.query;
            const query = {};
            if (riderEmail) {
                query.riderEmail = riderEmail;
            }

            if (deliveryStatus !== 'parcel_delivered') {
                // query.deliveryStatus = {$in: ['driver_assigned', 'rider_arriving']};
                query.deliveryStatus = { $nin: ['parcel_delivered'] };
            }
            else {
                query.deliveryStatus = deliveryStatus;
            }

            const cursor = parcelsCollection.find(query);
            const parcels = await cursor.toArray();
            res.send(parcels);

        });

        app.get('/parcels/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await parcelsCollection.findOne(query);
            res.send(result)
        });

        app.get('/parcels/delivery-status/stats', async (req, res) => {
            const pipeline = [
                {
                    $group: {
                        _id: "$deliveryStatus",
                        count: { $sum: 1 }
                    }
                },
                {
                    $project: {
                        status: "$_id",
                        count: 1,
                        // _id: 0
                    }
                }
            ]
            const result = await parcelsCollection.aggregate(pipeline).toArray();
            res.send(result);
        });

        app.post('/parcels', async (req, res) => {
            const parcel = req.body;
            const trackingId = generateTrackingId();
            parcel.trackingId = trackingId;
            logTracking(trackingId, 'parcel_created');
            parcel.createdAt = new Date();
            // console.log(parcel);
            const result = await parcelsCollection.insertOne(parcel);
            res.send(result);
        });

        app.patch('/parcels/:id', async (req, res) => {
            const { riderId, ridername, riderEmail, trackingId } = req.body;

            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const update = {
                $set: {
                    deliveryStatus: 'driver-assigned',
                    riderId: riderId,
                    ridername: ridername,
                    riderEmail: riderEmail,
                }
            }
            const result = await parcelsCollection.updateOne(query, update);

            // update rider Information
            const riderQuery = { _id: new ObjectId(riderId) };
            const riderUpdate = {
                $set: {
                    workStatus: 'in_delivery'
                }
            }
            const riderResult = await ridersCollection.updateOne(riderQuery, riderUpdate);
            logTracking(trackingId, 'driver-assigned');
            res.send({ result, riderResult });
        });

        // app.patch('/parcels/:id/assigned', async (req, res) => {});
        app.patch('/parcels/:id/status', async (req, res) => {
            const { deliveryStatus, riderId, trackingId } = req.body;
            const query = { _id: new ObjectId(req.params.id) };
            const update = {
                $set: {
                    deliveryStatus: deliveryStatus,
                }
            }
            if (deliveryStatus === 'parcel_delivered') {
                const riderQuery = { _id: new ObjectId(riderId) };
                const riderUpdate = {
                    $set: {
                        workStatus: 'available'
                    }
                }
                const riderResult = await ridersCollection.updateOne(riderQuery, riderUpdate);
            }
            const result = await parcelsCollection.updateOne(query, update);
            logTracking(trackingId, deliveryStatus);
            res.send(result);

        });





        //Payment Related API

        app.post('/create-checkout-session', async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseInt(paymentInfo.cost) * 100; // Convert to cents
            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        price_data: {
                            currency: 'USD',
                            unit_amount: amount,
                            product_data: {
                                name: paymentInfo.parcelName,
                            }
                        },

                        quantity: 1,
                    },
                ],
                customer_email: paymentInfo.senderEmail,
                mode: 'payment',
                metadata: {
                    parcelId: paymentInfo.parcelId,
                    parcelName: paymentInfo.parcelName,
                    trackingId: paymentInfo.trackingId,
                },
                success_url: `${process.env.SITE_DOMOAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.SITE_DOMOAIN}/dashboard/payment-cancelled`,
            });

            // res.redirect(303, session.url);
            console.log(session.url);
            res.send({ url: session.url });
        });

        app.patch('/payment-success', async (req, res) => {
            const sessionId = req.query.session_id;
            // console.log(sessionId);
            const session = await stripe.checkout.sessions.retrieve(sessionId);

            const transactionId = session.payment_intent;
            // console.log('retrives', session);
            // const trackingId = generateTrackingId();
            const trackingId = session.metadata.trackingId;

            const paymentexists = await paymentCollection.findOne({ transactionId: transactionId });
            if (paymentexists) {
                return res.send({ success: true, message: 'Payment already recorded', trackingId: paymentexists.trackingId, transactionId: transactionId, paymentInfo: paymentexists });
            }

            if (session.payment_status === 'paid') {
                const id = session.metadata.parcelId;
                const query = { _id: new ObjectId(id) };

                const update = {
                    $set: {
                        paymentStatus: 'Paid',
                        deliveryStatus: 'pending_pickup',
                    }
                }
                const result = await parcelsCollection.updateOne(query, update);

                const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    parcelId: session.metadata.parcelId,
                    parcelName: session.metadata.parcelName,
                    transactionId: session.payment_intent,
                    paymentStatus: session.payment_status,
                    paidAt: new Date(),
                    trackingId: trackingId,
                }

                const resultpayment = await paymentCollection.insertOne(payment);

                await logTracking(trackingId, 'parcel_paid');

                return res.send({
                    success: true,
                    modifiedparcel: result,
                    trackingId: trackingId,
                    transactionId: session.payment_intent,
                    paymentInfo: resultpayment
                });
            }

            return res.send({ success: false });
        })

        app.get('/payments', verifyFBToken, async (req, res) => {
            // console.log('query hit');
            const email = req.query.email;
            // console.log(email);
            const query = { customerEmail: email };
            const options = { sort: { paidAt: -1 } };
            if (email) {
                query.customerEmail = email;

                if (req.decodedEmail !== email) {
                    return res.status(403).send({ message: 'Forbidden access' });
                }
            }
            const cursor = paymentCollection.find(query, options).sort({ paidAt: -1 });
            const payments = await cursor.toArray();
            res.send(payments);
        });


        //Tracking related apis


        app.get('/trackings/:trackingId/logs', async (req, res) => {
            const trackingId = req.params.trackingId;
            const query = { trackingId };
            // const options = { sort: { createdAt: -1 } };
            const cursor = trackingsCollection.find(query);
            const trackings = await cursor.toArray();
            res.send(trackings);
        });




        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Zap is Shifting!');
});


app.listen(port, () => {
    console.log(`Zap is running on port ${port}`);
});