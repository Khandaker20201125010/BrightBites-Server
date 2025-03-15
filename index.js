const express  = require('express')
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000


//middleware 
app.use(cors());
app.use(express.json())


const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.texsw4y.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // await client.connect();
    // Send a ping to confirm a successful connection
    const  usersCollection = client.db("BrightBites").collection("users");
    const  doctorCollection = client.db("BrightBites").collection("doctors");
    //jwt related api
    app.post('/jwt',async (req, res) => {
      const user = req.body;
      const token =  jwt.sign(user, process.env.ACCESS_TOKEN_SECRET,{expiresIn: '1d'})
      res.send({token})
    })

    const verifyToken = (req, res, next) => {
     if(req.headers.authorization){
      return res.status(401).send({message: 'unauthorized access'})
     }
     const token = req.headers.authorization.split(' ')[1];
     
     jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if(err){
          return res.status(401).send({message: 'unauthorized access'})
        }
        req.decoded = decoded;
        next();
     })
    }

    app.get('/users',verifyToken, async(req, res) => {
        const result = await usersCollection.find().toArray();
        res.send(result)
    });


    app.get('/users/:email', async (req, res) => {
        const email = req.params.email
        const query = { email: email }
        const result = await usersCollection.findOne(query)
        res.send(result)
      })
      app.post('/users', async (req, res) => {
        const user = req.body;
        const query = { email: user.email }
        const existsUser = await usersCollection.findOne(query);
        if (existsUser) {
          return res.send({ message: 'user already exist', insertedId: null })
        }
        const result = await usersCollection.insertOne(user);
        res.send(result);
      })
      
     app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      if(email !== req.decoded.email){
        return res.status(403).send({message: 'unauthorized access'})
      }
      const query = { email: email }  ;
      const user =  await usersCollection.findOne(query);
      let admin = false;
      if(user?.role === 'admin'){
        admin = user?.role === 'admin'
      }
      res.send({admin})
     })
      















    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
   
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Doctor is checking')
})

app.listen(port, () => {
 console.log(`Doctor is Checking on ${port}`)
})