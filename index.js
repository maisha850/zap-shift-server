const express = require('express')
const app = express()
const cors = require('cors');
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 3000
function generateTrackingId() {
    const prefix = "PRCL"; // your brand prefix
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

    return `${prefix}-${date}-${random}`;
}

app.use(express.json())
app.use(cors())
const stripe = require('stripe')(process.env.STRIPE_SEC);

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
    app.get('/parcels' , async(req , res)=>{
        const query = {}
   const {email} = req.query
   if(email){
    query.senderEmail = email
   }
   const options = {sort : {created_at: -1}}
const cursor = parcelCollection.find(query , options)
const result = await cursor.toArray()
res.send(result)
    })
    app.get('/parcels/:id' , async(req , res)=>{
      const id = req.params.id;
      const query = {_id : new ObjectId(id)}
      const result = await parcelCollection.findOne(query)
      res.send(result)
    })
    // old
//     app.post('/create-checkout-session' , async(req, res)=>{
//       const paymentInfo = req.body
//       const amount = parseInt(paymentInfo.cost) * 100
//       const session = await stripe.checkout.sessions.create({
//     line_items: [
//       {
//         // Provide the exact Price ID (for example, price_1234) of the product you want to sell
// price_data: {
//   currency : 'USD',
//   unit_amount: amount,
//   product_data:{
//     name: paymentInfo.parcelName
//   }
// },
//         quantity: 1,
//       },
//     ],
//         customer_email: paymentInfo.senderEmail,
//     mode: 'payment',
//     meta_data : {
//       parcelId : paymentInfo.parcelId,
//          parcelName: paymentInfo.parcelName
//     },

//     success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,
//     cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
//   });
//   console.log(session)
//   res.send({url : session.url})
//     })
    // app.post('/parcels' , async(req , res)=>{
    //     const parcels = req.body
    //     parcels.created_at = new Date()
    //     console.log(parcels)
    //     const result = await parcelCollection.insertOne(parcels)
    //     res.send(result)
    // })
    app.delete('/parcels/:id', async(req , res)=>{
      const id = req.params.id
      const query = {_id : new ObjectId(id)}
      const result = await parcelCollection.deleteOne(query)
      res.send(result)
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
    parcelId : paymentInfo.parcelId
  },
  customer_email : paymentInfo.senderEmail,
  success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID`,
cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
});
res.send({url : session.url})

    })
    app.patch('/payment-success' , async(req , res)=>{
      const sessionId = req.body.session_id
      console.log(sessionId)
      res.send({success : true})
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      if(session.payment_status ==='paid'){
        const id = session.metadata.parcelId
        const query = {_id : new ObjectId(id)}
        const update = {
          $set : {
            payment_status: 'paid'
          }
        
        }
        const result = await paymentCollection.updateOne(query, update)
         const payment = {
                    amount: session.amount_total / 100,
                    currency: session.currency,
                    customerEmail: session.customer_email,
                    parcelId: session.metadata.parcelId,
                    parcelName: session.metadata.parcelName,
                    transactionId: session.payment_intent,
                    paymentStatus: session.payment_status,
                    paidAt: new Date(),
                     trackingId: generateTrackingId()
                }
          if (session.payment_status === 'paid') {
                    const resultPayment = await paymentCollection.insertOne(payment)

                    res.send({
                        success: true,
                        modifyParcel: result,
                        trackingId: trackingId,
                        transactionId: session.payment_intent,
                        paymentInfo: resultPayment
                    })
                }
      }
      res.send({success: false})
    })
    // app.patch('/payment-success' , async(req , res)=>{
    //   const sessionId = req.body.session_id
    //   const session = await stripe.checkout.sessions.retrieve(sessionId) 
    //   if(session.payment_status === 'paid'){
    //     const id = session.metadata.parcelId
    //     const query = {_id : new ObjectId(id)}
    //     const update ={
    //       $set : {
    //         payment_status : 'paid'
    //       }
    //     }
    //     const result = await parcelCollection.updateOne(update, query)
    //     res.send(result)
    //   }
       
    // })
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
