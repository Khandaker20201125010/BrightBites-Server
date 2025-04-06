const express = require('express')
const app = express()
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const paymentCollection = client.db('BrightBites').collection('payments');
    const reviewsCollection = client.db('BrightBites').collection('reviews');
    //jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
      res.send({ token })
    })

    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Forbidden access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Forbidden access' })
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
      const query = { _id: new ObjectId(id) };
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
          treatment: booking.treatment,  // This should match the field in the frontend
        };
    
        const alreadyBooked = await bookingsCollection.find(query).toArray();
        if (alreadyBooked.length) {
          return res.send({ acknowledged: false, message: `You already have a booking on ${booking.appointmentDate}` });
        }
    
        // Insert new booking
        const result = await bookingsCollection.insertOne(booking);
    
        // Correct: Find the appointment by the 'appointment' field, not 'name'
        const filter = { appointment: booking.treatment };  // Using 'appointment' instead of 'name'
        const updateDoc = {
          $pull: { slots: booking.slot },  // Remove the booked slot
        };
    
        // Update the appointment document to remove the booked slot
        await appointmentCollection.updateOne(filter, updateDoc);
    
        res.send(result);
      } catch (error) {
        console.error("Booking Error:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    

    app.get("/reviews", async (req, res) => {
      try {
        const { email } = req.query; // Get user email from query parameters
        let query = {};
        if (email) {
          query.email = email; // Filter reviews by user's email
        }

        const reviews = await reviewsCollection.find(query).toArray(); // MongoDB query
        res.json(reviews); // Return the reviews
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch reviews", error: error.message });
      }
    });


    app.post("/reviews", async (req, res) => {
      try {
        const review = req.body;
        const result = await reviewsCollection.insertOne(review);
        res.status(201).json({ success: true, message: "Review added successfully", data: result });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to add review", error: error.message });
      }
    });
    app.patch("/reviews/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { review } = req.body;

        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { review } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ success: false, message: "Review not found or unchanged." });
        }

        res.json({ success: true, message: "Review updated successfully." });
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to update review", error: error.message });
      }
    });

    // payment related api
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    })
    app.get('/payments/:email', verifyToken, async (req, res) => {
      const userEmail = req.params.email;

      if (userEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'Unauthorized access' });
      }

      try {
        const query = { email: userEmail };
        const payments = await paymentCollection.find(query).toArray();
        res.send(payments); // Ensure transactionId is part of each payment object
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).send({ message: "Server error" });
      }
    });


    app.post('/payments', async (req, res) => {
      try {
        const { email, price, date, bookingIds, status, transactionId } = req.body;

        // Fetch booking details before deletion
        const booking = await bookingsCollection.findOne({ _id: new ObjectId(bookingIds[0]) });

        if (!booking) {
          return res.status(404).send({ success: false, message: "Booking not found." });
        }

        // Store payment along with treatment details
        const payment = {
          email,
          price,
          date,
          status,
          transactionId,
          treatment: booking.treatment,  // Store treatment name
          doctor: booking.doctor,        // Store doctor name if available
        };

        const paymentResult = await paymentCollection.insertOne(payment);

        if (paymentResult.insertedId) {
          // Delete the booking after payment
          const deleteResult = await bookingsCollection.deleteOne({ _id: new ObjectId(bookingIds[0]) });

          if (deleteResult.deletedCount === 1) {
            res.send({ success: true, message: "Payment successful and booking deleted." });
          } else {
            res.send({ success: false, message: "Payment successful, but booking deletion failed." });
          }
        } else {
          res.send({ success: false, message: "Payment processing failed." });
        }
      } catch (error) {
        console.error("Error processing payment:", error);
        res.status(500).send({ success: false, message: "Payment processing failed" });
      }
    });

// Add the aggregate pipeline for total revenue, total appointments, and total payments
app.get('/dashboard-stats', async (req, res) => {
  try {
    const [revenueResult, totalAppointments, totalPayments] = await Promise.all([
      paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $toDouble: "$price" } } // Sum up the price field for total revenue
          }
        }
      ]).toArray(),
      
      appointmentCollection.countDocuments({}), // Get total number of appointments
      paymentCollection.countDocuments({ status: 'paid' }) // Get total number of paid appointments
    ]);

    const totalRevenue = revenueResult[0]?.totalRevenue || 0;
    const stats = {
      totalRevenue,
      totalAppointments: totalAppointments,
      totalPayments: totalPayments
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).send({ message: "Server error" });
  }
});

    app.get('/revenue-per-treatment', async (req, res) => {
      try {
        const revenueData = await paymentCollection.aggregate([
          {
            $group: {
              _id: "$treatment",   // Group by treatment
              totalRevenue: { $sum: { $toDouble: "$price" } }, // Sum the prices for each treatment
              totalBookings: { $sum: 1 } // Count the number of bookings for each treatment
            }
          },
          {
            $sort: { totalRevenue: -1 } // Optional: Sort by total revenue, descending
          }
        ]).toArray();
    
        res.send(revenueData); // Send the revenue data for each treatment
      } catch (error) {
        console.error("Error calculating revenue:", error);
        res.status(500).send({ message: "Error calculating revenue", error: error.message });
      }
    });
    // Backend: add this endpoint to your Express server (e.g. below your other payment endpoints)
// AFTER you create paymentCollection, but BEFORE app.listen(...)
app.get('/user-total-purchases', async (req, res) => {
  try {
    const pipeline = [
      { $group: { _id: "$email", totalPurchase: { $sum: { $toDouble: "$price" } } } },
      { $project: { _id: 0, email: "$_id", totalPurchase: 1 } }
    ];
    const results = await paymentCollection.aggregate(pipeline).toArray();
    res.json(results);
  } catch (err) {
    console.error("Error fetching user totals:", err);
    res.status(500).json({ message: "Failed to fetch user totals" });
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