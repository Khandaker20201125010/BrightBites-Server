const express = require('express')
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000


//middleware 
app.use(cors());
app.use(express.json())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
    const usersCollection = client.db("BrightBites").collection("users");
    const doctorCollection = client.db("BrightBites").collection("doctors");
    const appointmentCollection = client.db("BrightBites").collection("appointments");
    const bookingsCollection = client.db('BrightBites').collection('bookings');
    //jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
      res.send({ token })
    })

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' })
      }
      const token = req.headers.authorization.split(' ')[1];

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'unauthorized access' })
      }
      next();
    }

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
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
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };;
      const result = await usersCollection.deleteOne(filter);
      res.send(result);
    })
    app.patch('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body; // New role (admin, doctor, patient)
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: role },
      };
    
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorized access' })
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin'
      }
      res.send({ admin })
    })
    // doctor related
    app.get('/doctors', async (req, res) => {
      const result = await doctorCollection.find().toArray();
      res.send(result)
    })

    app.post('/doctors', verifyToken, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    })
    app.delete('/doctors/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };;
      const result = await doctorCollection.deleteOne(filter);
      res.send(result);
    })
    app.get('/appointments', async (req, res) => {
      const result = await appointmentCollection.find().toArray();
      res.send(result)
    })

    app.post('/appointments', verifyToken, verifyAdmin, async (req, res) => {
      const appointment = req.body;
      const result = await appointmentCollection.insertOne(appointment);
      res.send(result);
    })
    app.get('/appointments', async (req, res) => {
      const date = req.query.date;
      const query = {};
      const options = await appointmentCollection.find(query).toArray();

      // get the bookings of the provided date
      const bookingQuery = { appointmentDate: date }
      const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

      // code carefully :D
      options.forEach(option => {
        const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
        const bookedSlots = optionBooked.map(book => book.slot);
        const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
        option.slots = remainingSlots;
      })
      res.send(options);
    });
    app.get('/bookings', verifyToken, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;

      if (email !== decodedEmail) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const query = { email: email };
      const bookings = await bookingsCollection.find(query).toArray();
      res.send(bookings);
    });

    app.get('/bookings/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingsCollection.findOne(query);
      res.send(booking);
    })

    app.post('/bookings', async (req, res) => {
      try {
          const booking = req.body;
          
          // Check if the user already booked this slot
          const query = {
              appointmentDate: booking.appointmentDate,
              email: booking.email,
              treatment: booking.treatment,
          };
          
          const alreadyBooked = await bookingsCollection.find(query).toArray();
          if (alreadyBooked.length) {
              return res.send({ acknowledged: false, message: `You already have a booking on ${booking.appointmentDate}` });
          }
  
          // Insert new booking
          const result = await bookingsCollection.insertOne(booking);
  
          // Remove the booked slot from the appointments collection
          const filter = { name: booking.treatment }; // Find the correct appointment
          const updateDoc = {
              $pull: { slots: booking.slot }, // Remove the booked slot
          };
  
          await appointmentCollection.updateOne(filter, updateDoc);
  
          res.send(result);
      } catch (error) {
          console.error("Booking Error:", error);
          res.status(500).send({ message: "Internal server error" });
      }
  });
  














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