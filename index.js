const express = require('express')
const app = express()
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SEC);

const port = process.env.PORT || 3000
const crypto = require("crypto");
const admin = require("firebase-admin");

const serviceAccount = require("./zap-shift-firebase-adminsdk.json");
const { count } = require('console');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

function generateTrackingId() {
    const prefix = "PRCL"; // your brand prefix
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

    return `${prefix}-${date}-${random}`;
}
// middleware
app.use(express.json())
app.use(cors())
const verifyFBToken =async(req, res, next)=>{
  
  const token = req.headers.authorization
 
  if(!token){
   return res.status(401).send({message: 'unauthorized access'})
  }
  try{
const idToken = token.split(' ')[1]
const decoded = await admin.auth().verifyIdToken(idToken)
console.log('in decoded' , decoded)
req.decoded_email = decoded.email
 next()
  }
  catch(err){
 return res.status(401).send({message: 'unauthorized access'})
  }
 
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6aaggy0.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
app.get('/', (req, res) => {
  res.send('zap shift server is running')
})

app.listen(port, () => {
  console.log(`zap shift server is running on port ${port}`)
})
async function run() {
  try {
    
    await client.connect();
    const db = client.db('zap_shift')
    const parcelCollection  = db.collection('parcels')
   const paymentCollection = db.collection('payments');
   const userCollection = db.collection('users');
   const riderCollection = db.collection('riders');
   const trackingCollection = db.collection('trackings');
   const verifyAdminToken=async(req ,res, next)=>{
  const email = req.decoded_email
  const query = {email}
  const user = await userCollection.findOne(query)
  if(!user || user.role!=='admin'){
    return res.status(403).send({message: 'forbidden access'})
  }
  next()
}
//    const verifyRiderToken=async(req ,res, next)=>{
//   const email = req.decoded_email
//   const query = {email}
//   const user = await userCollection.findOne(query)
//   if(!user || user.role!=='rider'){
//     return res.status(403).send({message: 'forbidden access'})
//   }
//   next()
// }
const logTrackings=async(trackingId , status)=>{
  const logInfo={
    trackingId,
    status,
    details: status.split('-').join(' '),
    created_at: new Date()
  }
  const result = await trackingCollection.insertOne(logInfo)
  return result
}

  //  user
  app.get('/users' , verifyFBToken , async(req , res)=>{
    const search = req.query.searchText
    const query = {}
   if(search){
    query.$or=[
      {displayName: {$regex: search , $options: 'i'}},
      {email: {$regex: search , $options: 'i'}}
    ]
   }
    const result = await userCollection.find(query).sort({createdAt: -1}).limit(5).toArray()
    res.send(result)
  })
  app.get('/users/:email/role' , async(req , res)=>{
    const email = req.params.email
    const query = {email}
    const user = await userCollection.findOne(query)
    res.send({role: user?.role || 'user' })
  })
app.post('/users' , async(req , res)=>{
  const user = req.body
  user.role = 'user',
  user.createdAt = new Date()
  const email = user.email
  
  const userExist = await userCollection.findOne({email})
  if(userExist){
    return res.send({message: 'user exists'})
  }
  const result = await userCollection.insertOne(user)
  res.send(result)
})
app.patch('/users/:id/role' , verifyFBToken,verifyAdminToken, async(req , res)=>{
  const roleInfo = req.body
  const id= req.params.id
  const query = {_id : new ObjectId(id)}
  const update = {
    $set:{
      role: roleInfo.role
    }
  }
  const result = await userCollection.updateOne(query, update)
  res.send(result)
})
// rider
app.get('/riders' , async(req , res)=>{
  const {status , districts , workStatus}=req.query
  const query = {}
  if(status){
    query.status = status
  }
  if(districts){
    query.districts = districts
  }
  if(workStatus){
    query.workStatus = workStatus
  }
  const result = await riderCollection.find(query).toArray()
  res.send(result)
})
app.post('/riders' , async(req , res)=>{
  const rider = req.body
  rider.status= 'pending'
  rider.createdAt = new Date()
  const result = await riderCollection.insertOne(rider)
  res.send(result)
})
app.patch('/riders/:id' , verifyFBToken,verifyAdminToken,  async(req ,res)=>{
  const status = req.body.status
  const id = req.params.id
  const query = {_id : new ObjectId(id)}
  const update = {
    $set: {
      status: status,
      workStatus: 'available'
    }
  }
   const result = await riderCollection.updateOne(query, update)
  if(status === 'approved'){
    const email = req.body.email
    const userQuery = {email}
    const updated = {
$set:{
  role: 'rider'
}
    }
    const updatedresult = await userCollection.updateOne(userQuery,updated)
    
  }
 
  res.send(result)
})
  //  parcel
  app.get('/parcels/rider' , async(req , res)=>{
    const {riderEmail , deliveryStatus}=req.query
    const query = {}
    if(riderEmail){
      query.riderEmail = riderEmail
    }
    if(deliveryStatus !== 'parcel_delivered'){
      query.deliveryStatus = {$nin : ['parcel_delivered']}
    }
    else{
      query.deliveryStatus= deliveryStatus
    }
    const result = await parcelCollection.find(query).toArray()
    res.send(result)
  })
  app.patch('/parcels/:id/status' , async(req, res)=>{
    const{deliveryStatus , riderId , trackingId}=req.body
    const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const update = {
        $set:{
          deliveryStatus: deliveryStatus
        }
      }
    if (deliveryStatus === 'parcel_delivered') {
                // update rider information
                const riderQuery = { _id: new ObjectId(riderId) }
                const riderUpdatedDoc = {
                    $set: {
                        workStatus: 'available'
                    }
                }
                const resultRider = await riderCollection.updateOne(riderQuery , riderUpdatedDoc)
              }
      const result = await parcelCollection.updateOne(query , update)
      logTrackings(trackingId , deliveryStatus)
      res.send(result)
  })
    app.get('/parcels' , async(req , res)=>{
        const query = {}
   const {email , deliveryStatus} = req.query
   if(email){
    query.senderEmail = email
   }
   if(deliveryStatus){
    query.deliveryStatus = deliveryStatus
   }
   const options = {sort : {created_at: -1}}
const cursor = parcelCollection.find(query , options)
const result = await cursor.toArray()
res.send(result)
    })
    app.get('/parcels/delivery-status/status' , async(req , res)=>{
      const pipeline = [
        {
          $group:{
            _id: '$deliveryStatus',
            count: {$sum: 1}
          }
        },
        {
          $project:{
            status: '$_id',
            count: 1
          }
        }
      ]
      const result = await parcelCollection.aggregate(pipeline).toArray()
      res.send(result)
    })
    app.get('/rider/delivery-per-day', async(req,res)=>{
      const email = req.query.email
      const pipeline =[
        {
          $match:{
            riderEmail: email,
            deliveryStatus: "parcel_delivered"
          }
          
        },
        {
           $lookup:{
              from: 'trackings',
              localField: 'trackingId',
              foreignField: 'trackingId',
              as: 'parcel-trackings'
            }
        },
        {
          $unwind: '$parcel-trackings'
        },
        {
          $match: {
            "parcel-trackings.status": 'parcel_delivered'
          }
        },
         {
                    // convert timestamp to YYYY-MM-DD string
                    $addFields: {
                        deliveryDay: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$parcel_trackings.created_at"
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
      ]
      const result = await parcelCollection.aggregate(pipeline).toArray()
      res.send(result)
    })
    app.get('/parcels/:id' , async(req , res)=>{
      const id = req.params.id;
      const query = {_id : new ObjectId(id)}
      const result = await parcelCollection.findOne(query)
      res.send(result)
    })
   
    app.post('/parcels' , async(req , res)=>{
        const parcels = req.body
        const trackingId = generateTrackingId()
        parcels.created_at = new Date()
        parcels.trackingId = trackingId
        logTrackings(trackingId , 'parcel_created')
        
        console.log(parcels)
        const result = await parcelCollection.insertOne(parcels)
        res.send(result)
    })
    app.delete('/parcels/:id', async(req , res)=>{
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await parcelCollection.deleteOne(query)
      res.send(result)
    })
    app.patch('/parcels/:id' , async(req ,res)=>{
      const {riderId , riderName , riderEmail , trackingId}=req.body
      const id = req.params.id
       const query = {_id : new ObjectId(id)}
       const update={
        $set:{
          deliveryStatus: 'driver_assigned',
          riderId: riderId,
          riderName: riderName,
          riderEmail: riderEmail
        }
       }
       const result = await parcelCollection.updateOne(query, update)
       const riderQuery = {_id: new ObjectId(riderId)}
       const updateRider ={
        $set:{
          workStatus: 'In_delivery'
        }
       }
       const riderResult = await riderCollection.updateOne(riderQuery , updateRider)
       logTrackings(trackingId, 'driver_assigned' )
res.send(riderResult)

    })
    

    app.post('/payment-checkout-session', async(req ,res)=>{
      const paymentInfo = req.body
      const amount = parseInt(paymentInfo.cost) * 100
      const session = await stripe.checkout.sessions.create({
  
  line_items: [
    {
   price_data: {
    currency: 'usd',
    unit_amount: amount,
    product_data : {
      name : `please pay for ${paymentInfo.parcelName}`
    }
   },
      quantity: 1,
    },
  ],
  mode: 'payment',
  metadata: {
    parcelId : paymentInfo.parcelId,
    parcelName : paymentInfo.parcelName,
    trackingId: paymentInfo.trackingId
  },
  customer_email : paymentInfo.senderEmail,
  success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
});
res.send({url : session.url})

    })
  

    app.patch('/payment-success', async (req, res) => {
    try {
        const sessionId = req.query.session_id;

        if (!sessionId) return res.status(400).send({ success: false, message: "Session ID missing" });

        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log('Stripe session:', session);
  const transactionId = session.payment_intent
  const query = {transactionId : transactionId}
  const paymentExists = await paymentCollection.findOne(query)
  if(paymentExists){
    return res.send({message: 'already exists' , transactionId , trackingId: paymentExists.trackingId})
  }
           const trackingId = session.metadata.trackingId;
        if (session.payment_status === 'paid') {
          const parcelId = session.metadata.parcelId;

            const query = { _id: new ObjectId(parcelId) };
            const update = { $set: 
              { payment_status: 'paid',
               deliveryStatus: 'pending-pickup' ,
                trackingId: trackingId }
               };
              
            const result = await parcelCollection.updateOne(query, update);

            const payment = {
                amount: session.amount_total / 100,
                currency: session.currency,
                customerEmail: session.customer_email,
                parcelId: parcelId,
                parcelName: session.metadata.parcelName,
                transactionId: session.payment_intent,
                paymentStatus: session.payment_status,
                trackingId: trackingId,
                paidAt: new Date(),
            };

            const resultPayment = await paymentCollection.insertOne(payment);
             logTrackings(trackingId , 'pending-pickup')

            // ✅ Send only one response here
        return res.send({
                success: true,
                modifyParcel: result,
                paymentInfo: resultPayment,
                trackingId: trackingId,
                transactionId: session.payment_intent
            });
        }

        // Payment not completed
        return res.send({ success: false, message: "Payment not completed yet" });

    } catch (error) {
        console.error(error);
        res.status(500).send({ success: false, message: "Server error" });
    }
});

app.get('/payments' , verifyFBToken,  async(req, res)=>{
  const email = req.query.email
  console.log('headers', req.headers)
  const query = {}
  if(email){
    query.customerEmail = email
    if(email !== req.decoded_email){
      return res.status(403).send({message: 'forbidden access'})
    }
  }
  const cursor = paymentCollection.find(query).sort({paidAt: -1})
  const result = await cursor.toArray()
  res.send(result)
})
// trackings
app.get('/trackings/:trackingId/logs', async(req , res)=>{
  const trackingId = req.params.trackingId
  const query = {trackingId}
  const result = await trackingCollection.find(query).toArray()
  res.send(result)
})


  
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
