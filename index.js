const express = require('express');
const bodyParser = require('body-parser');
// const MongoClient = require('mongodb').MongoClient;
const { MongoClient, ObjectId } = require('mongodb');


const app = express();
const port = 4000;
const mongo_db_url = 'mongodb+srv://arielleandmay:8O7mO6TmsVuFYE86@university-carpool.2wydnz8.mongodb.net/?retryWrites=true&w=majority';
const client = new MongoClient(mongo_db_url, { useNewUrlParser: true, useUnifiedTopology: true });
const db_name = 'University-Carpool';
const user_collection = 'Users';
const rides_collection = 'Rides';
const cors = require('cors');
const moment = require('moment-timezone');
const schedule = require('node-schedule');

app.use(cors());
app.use(bodyParser.json());
app.listen(port, () => {
  console.log(`Connected to port ${port}!`);
});


/*A. User Registration */
app.post('/signup', async (req, res) => {
  let username = req.body.username;
  let password = req.body.password;
  let email = req.body.email;
  let phonenumber = req.body.phonenumber
  let university = req.body.university;

  console.log('Input - Username: '+username + ', Password: '+password);
    client.connect().then(async() => {
      const info = client.db(db_name).collection(user_collection);
      const existingUser = await info.findOne({username: username});
      
      if(existingUser != null) {
        console.log('Username Already Exists');
        return res.json({ success: false, error: 'Username Already Exists' });
      }
      //If No Username Exists in the DB already
      const newUser = await info.insertOne({
        username: username,
        password : password,
        email: email,
        phonenumber: phonenumber,
        university: university,
        rideHistory:[],
        passengerHistory:[]
      });
      
      console.log('User Successfully Registered!' + username + ' with Password: '+ password);
      return res.json({username: username, password: password, email: email, phonenumber: phonenumber, university: university, success: true});
    });
});

/*B. User Login */
app.get('/login', async(req, res) => {
  let email = req.query.email;
  let password = req.query.password;
    client.connect().then(async() => {
      const info = client.db(db_name).collection(user_collection);
      const user = await info.findOne({email: email});
       
      if (user === null) {
        console.log('User Not Found');
        return res.json({ success: false, message: 'Invalid Login Credentials' });
      }
      console.log('Found user in DB!! ' + user.username + ' The Password in DB: '+ user.password);
      
      if( password == user.password) {
        console.log('Login Success!');
        
        return res.json({ username: user.username, password: user.password, phonenumber: user.phonenumber, email: user.email, university: user.university, success: true}); 
      }
      else {
        console.log("Passwords don't match");
        return res.json({ success: false, message: 'Invalid Login Credentials' });
      }
           
    }); 
});


/*C. Create New Ride */
app.post('/newride', async (req, res) => {
  let driverUsername = req.body['driver-username'];
  let startingAddress = req.body['starting-address'];
  let startingCity = req.body['starting-city'];
  let destinationAddress = req.body['destination-address'];
  let destinationCity = req.body['destination-city'];
  let rideTime = req.body['ride-time'];
  let availableSpots = req.body['available-spots'];

  client.connect().then(async() => {
    const rideInfo = client.db(db_name).collection(rides_collection);
    const newRide = await rideInfo.insertOne({
      'driver-username': driverUsername,
      'starting-address': startingAddress,
      'starting-city': startingCity,
      'destination-address': destinationAddress,
      'destination-city': destinationCity,
      'ride-time': rideTime,
      'available-spots': availableSpots,
      'requestedPassengers': [],
      'approvedPassengers': [],
      "isValid": true
    });
    
    if(newRide.insertedId != null) {
      console.log('New ride successfully added to the DB!');
      
      const userInfo = client.db(db_name).collection(user_collection);
      const updateResult = await userInfo.updateOne(
        { username: driverUsername }, 
        { $push: { rideHistory: newRide.insertedId } }
      );
      if (updateResult.modifiedCount > 0) {
        console.log('User rideHistory updated successfully');
      } else {
        console.log('Failed to update user rideHistory');
      }

      return res.json({success: true, message: 'New ride Successfully Created!'});
    } else {
      console.log('Failed to add new ride to the DB');
      return res.json({success: false, message: 'Failed to Add New Ride'});
    }

    
  });
});

//Updating isValid: Checking Once a Day if Rides have already occured
const updateRideValidity = async () => {
  console.log('Updating ride validity...');

  client.connect().then(async () => {
    const rideInfo = client.db(db_name).collection(rides_collection);
    const rides = await rideInfo.find().toArray();

    for (const ride of rides) {
      const rideTime = moment(ride['ride-time']).tz('Asia/Jerusalem');
      const now = moment().tz('Asia/Jerusalem');
      const isValid = rideTime.isAfter(now);
      await rideInfo.updateOne({ _id: ride._id }, { $set: { isValid: isValid } });
    }

    console.log('Ride validity updated successfully.');
  }).catch((err) => {
    console.log('Error occurred while updating ride validity', err);
  });
};

// Schedule to run every day at 00:00
schedule.scheduleJob('0 0 * * *', updateRideValidity);


/*D. Search for a ride */
app.get('/searchride', async (req, res) => {
  let startingCity = req.query['starting-city'];
  let destinationCity = req.query['destination-city'];
  let rideTime = new Date(req.query['ride-time']);

  console.log('Received parameters from query:');
  console.log('Starting City: ', startingCity);
  console.log('Destination City: ', destinationCity);
  console.log('Ride Time: ', rideTime);

  //Create date range for the ride time (one hour before and after)
  let minRideTime = new Date(rideTime.getTime() - (1000 * 60 * 60)); //Minus one hour
  let maxRideTime = new Date(rideTime.getTime() + (1000 * 60 * 60)); //Plus one hour

  console.log('Minimum Ride Time: ', minRideTime);
  console.log('Maximum Ride Time: ', maxRideTime);

  // Convert minRideTime and maxRideTime to strings for comparison with 'ride-time' in the DB
  const minRideTimeStr = moment(minRideTime).tz('Asia/Jerusalem').format('YYYY-MM-DDTHH:mm:ss');
  const maxRideTimeStr = moment(maxRideTime).tz('Asia/Jerusalem').format('YYYY-MM-DDTHH:mm:ss');

  client.connect().then(async() => {
    const rideInfo = client.db(db_name).collection(rides_collection);

    console.log('Searching for matching rides in database...');

    const matchingRides = await rideInfo.find({
      'starting-city': startingCity,
      'destination-city': destinationCity,
      'ride-time': {
        $gte: minRideTimeStr,
        $lte: maxRideTimeStr
      },
      'isValid': true
    }).toArray();

    if(matchingRides.length > 0) {
      console.log(`Found ${matchingRides.length} matching rides!`);
      return res.json({success: true, message: `Found ${matchingRides.length} Matching Rides!` , matchingRides: matchingRides});
    } else {
      console.log('No matching rides found');
      return res.json({success: false, message: 'No Matching Rides Found', matchingRides:[]});
    }
  }).catch((err) => {
    console.log('Error occurred while searching for rides', err);
    return res.json({success: false, message: 'Error Occurred While Searching For Rides'});
  });
});

/*E. Request for a ride */
app.post('/requestride', async (req, res) => {
  let username = req.body.username;
  let rideId = req.body.rideId;
  let startingAddress = req.body['starting-address'];
  let startingCity = req.body['starting-city'];
  let destinationAddress = req.body['destination-address'];
  let destinationCity = req.body['destination-city'];
  let rideTime = req.body['ride-time'];
  let objectRideId = new ObjectId(rideId);
  console.log(`Converted rideId: ${objectRideId}`);
  
  console.log(`User ${username} is trying to request for a ride ${rideId}`);

  client.connect().then(async() => {
    const rideInfo = client.db(db_name).collection(rides_collection);
    const userInfo = client.db(db_name).collection(user_collection);

    const ride = await rideInfo.findOne({_id: objectRideId});
    const user = await userInfo.findOne({ username: username });

    if (ride === null) {
      console.log('Ride Not Found');
      return res.json({ success: false, message: 'Invalid ride id' });
    }

    console.log(`Found ride in DB with id: ${rideId}. Available spots: ${ride['available-spots']}`);
    
    if (user === null) {
      console.log('User Not Found');
      return res.json({ success: false, message: 'Invalid User' });
    }

    // Check if the ride has available spots
    if( ride['available-spots'] > 0 ) {
      console.log('Ride has available spots!');
      
      const phoneNumber = user.phonenumber;
      const passengerRequest = {
        username,
        phoneNumber,
        'rideId':objectRideId,
        'starting-address': startingAddress,
        'starting-city': startingCity,
        'destination-address': destinationAddress,
        'destination-city': destinationCity,
        'ride-time': rideTime
      };

      // Add the user to the passengers array 
      const updatedRide = await rideInfo.updateOne(
        {_id: objectRideId}, 
        {
          $push: { requestedPassengers: passengerRequest},
        }
      );

      // Add the ride request to the passenger's passengerHistory
      await userInfo.updateOne(
        { username: username },
        { $push: { passengerHistory: {
            rideId,
            'driver-username': ride['driver-username'],
            'starting-address': passengerRequest['starting-address'],
            'starting-city': passengerRequest['starting-city'],
            'destination-address': passengerRequest['destination-address'],
            'destination-city': passengerRequest['destination-city'],
            'ride-time': passengerRequest['ride-time'],
            status: 'requested'
          } } }
      );

      if(updatedRide.modifiedCount > 0) {
        console.log('Ride successfully updated!');
        return res.json({success: true, message: 'Ride Request Has Been Accepted!'});
      } else {
        console.log('Failed to update ride');
        return res.json({success: false, message: 'Failed to Update Ride'});
      }

    }
    else {
      console.log('Ride has no available spots');
      return res.json({ success: false, message: 'Ride has No Available Spots' });
    }
           
  }).catch((err) => {
    console.log('Error occurred while requesting for a ride', err);
    return res.json({success: false, message: 'Error Occurred While Requesting for a Ride'});
  });

});

//F. Show Requested Passengers for a User's Ride
app.post('/showrequestedpassengers', async (req, res) => {
  let username = req.body.username;

  console.log(`Fetching requested passengers for user ${username}`);

  client.connect().then(async () => {
    const userInfo = client.db(db_name).collection(user_collection);
    const user = await userInfo.findOne({username: username});

    if (user === null) {
      console.log('User Not Found');
      return res.json({ success: false, message: 'Invalid username' });
    }

    // Fetching all ride details from the user's ride history
    const rideInfo = client.db(db_name).collection(rides_collection);
    const rideDetails = await rideInfo.find({
       _id: { $in: user.rideHistory.map(id => new ObjectId(id)) },
       isValid:true
      }).toArray();

    // Array to store the requested passenger details
    let requestedPassengersDetails = [];

    for (const ride of rideDetails) {
      requestedPassengersDetails.push(...ride.requestedPassengers);
    }

    console.log('Successfully fetched requested passengers');
    return res.json({success: true, rides: rideDetails, requestedPassengers: requestedPassengersDetails});
  }).catch((err) => {
    console.log('Error occurred while fetching requested passengers', err);
    return res.json({success: false, message: 'Error occurred while fetching requested passengers'});
  });
});

//G. Approving Passengers for a Ride
app.post('/approvepassengers', async (req, res) => {
  let username = req.body.username; // Driver's username
  let passengerUsername = req.body.passengerUsername;
  let rideId = req.body.rideId;
  let action = req.body.action; // Approve or Deny
  let objectRideId = new ObjectId(rideId);

  console.log(`Driver ${username} is trying to approve passenger ${passengerUsername} for ride ${rideId}`);

  client.connect().then(async () => {
    const rideInfo = client.db(db_name).collection(rides_collection);
    const userInfo = client.db(db_name).collection(user_collection);

    const ride = await rideInfo.findOne({ _id: objectRideId });
    if (ride === null) {
      console.log('Ride Not Found');
      return res.json({ success: false, message: 'Invalid ride ID' });
    }
    
    // Check if the driver's username matches the username in the ride object
    if (ride['driver-username'] !== username) {
      console.log('Driver username does not match the ride owner');
      return res.json({ success: false, message: 'You are not the driver of this ride' });
    }
    
    if (action === "Approve") {
      // Find the passenger object
        const passenger = ride.requestedPassengers.find(p => p.username === passengerUsername);

      // Check if there are available spots and if the passenger is in the requested passengers list
      if (ride['available-spots'] > 0 && passenger) {
        console.log('Ride has available spots, approving passenger!');

      // Remove passenger from requestedPassengers and add to approvedPassengers, decrease available spots
        const updatedRide = await rideInfo.updateOne(
          { _id: objectRideId },
          {
            $pull: { requestedPassengers: { username: passengerUsername , rideId: objectRideId } },
            $push: { approvedPassengers: passenger },
            $inc: { 'available-spots': -1 }
          }
        );

      // Update passengerHistory status to 'approved'
        const updateUser = await userInfo.updateOne(
        { username: passengerUsername },
        { $set: { 'passengerHistory.$[elem].status': 'approved' } },
        { arrayFilters: [{ 'elem.rideId': rideId }] }
      );

        if (updatedRide.modifiedCount > 0 && updateUser.modifiedCount > 0) {
          console.log('Ride successfully updated, passenger approved!');
          return res.json({ success: true, message: 'Passenger has been approved!' });
        } else {
          console.log('Failed to update ride');
          return res.json({ success: false, message: 'Failed to update ride' });
        }
      } else {
        console.log('Ride has no available spots or passenger not in the requested list');
        return res.json({ success: false, message: 'Ride has no available spots or passenger not in the requested list' });
      }
    } else if (action === "Deny") {
      // Remove passenger from requestedPassengers
      const updatedRide = await rideInfo.updateOne(
        { _id: objectRideId },
        {
          $pull: { requestedPassengers: { username: passengerUsername } }
        }
      );

      // Update passengerHistory status to 'declined'
      const updateUser = await userInfo.updateOne(
        { username: passengerUsername },
        { $set: { 'passengerHistory.$[elem].status': 'denied' } },
        { arrayFilters: [{ 'elem.rideId': rideId }] }
      );

      if (updatedRide.modifiedCount > 0 && updateUser.modifiedCount > 0) {
        console.log('Ride successfully updated, passenger denied!');
        return res.json({ success: true, message: 'Passenger has been denied!' });
      } else {
        console.log('Failed to update ride');
        return res.json({ success: false, message: 'Failed to update ride' });
      }
    } else {
      console.log('Invalid action');
      return res.json({ success: false, message: 'Invalid action. Must be "Approve" or "Deny".' });
    }
  }).catch((err) => {
    console.log('Error occurred while processing passenger', err);
    return res.json({ success: false, message: 'Error occurred while processing passenger' });
  });
});

//H. Retrieve the Passenger History
app.post('/statuspassenger', async (req, res) => {
  let username = req.body.username; 
  
  console.log(`Fetching passenger status for user ${username}`);

  client.connect().then(async () => {
    const userInfo = client.db(db_name).collection(user_collection);
    const user = await userInfo.findOne({username: username});

    if (user === null) {
      console.log('User Not Found');
      return res.json({ success: false, message: 'Invalid username' });
    }
    const passengerHistory = user.passengerHistory;

    // Preparing an array to hold the resulting passengerHistory including the driver's phone numbers
    let resultHistory = [];
    
    for (const ride of passengerHistory) {
      let resultRide = { ...ride };
      if (ride.status === "approved") {
        // If status is approved, find the corresponding driver and extract their phone number
        const driver = await userInfo.findOne({ username: ride['driver-username'] });
        if (driver) {
          resultRide['phonenumber'] = driver.phonenumber;
        }
      }
      else{
        resultRide['phonenumber'] = "Not Approved to View Driver's Phone Number";
      }
      console.log("Ride history: ", resultRide);
      resultHistory.push(resultRide);
    }

    console.log('Successfully fetched passenger status');
    return res.json({success: true, passengerHistory: resultHistory});
  }).catch((err) => {
    console.log('Error occurred while fetching passenger status', err);
    return res.json({success: false, message: 'Error occurred while fetching passenger status'});
  });
});

/*I. Update User Settings */
app.put('/updateUser', async (req, res) => {
  let username = req.body.username;
  let newDetails = {
      password: req.body.password,
      email: req.body.email,
      phonenumber: req.body.phonenumber,
      university: req.body.university
  };

  try {
      await client.connect();
      const users = client.db(db_name).collection(user_collection);
      
      const result = await users.updateOne({ username: username }, { $set: newDetails });
      
      if (result.modifiedCount === 1) {
          console.log('Successfully updated user details for', username);
          return res.json({ success: true, message: 'Successfully updated user details.' });
      } else {
          console.log('Failed to update user details for', username);
          return res.json({ success: false, message: 'Failed to update user details.' });
      }
  } catch (error) {
      console.error('Error updating user details:', error);
      return res.json({ success: false, message: 'Error updating user details.' });
  }
});

//J. Fetching Active Rides
app.post('/activerides', async (req, res) => {
  let username = req.body.username;

  console.log(`Fetching active rides for user ${username}`);

  client.connect().then(async () => {
    const rideCollection = client.db(db_name).collection(rides_collection); 
    const userCollection = client.db(db_name).collection(user_collection);

    // Check if the user exists
    const user = await userCollection.findOne({username: username});
    if (user === null) {
      console.log('User Not Found');
      return res.json({ success: false, message: 'Invalid username' });
    }

    // Find all rides where isValid is true and the username matches
    const activeRides = await rideCollection.find({ 'isValid': true, 'driver-username': username }).toArray();

    // Prepare the result array with all details including approvedpassengers
    let resultRides = [];
    for (const ride of activeRides) {
      let resultRide = { ...ride };
      resultRide['approvedPassengers'] = ride.approvedPassengers;
      resultRides.push(resultRide);
    }

    console.log('Successfully fetched active rides');
    return res.json({ success: true, activeRides: resultRides });
  }).catch((err) => {
    console.log('Error occurred while fetching active rides', err);
    return res.json({ success: false, message: 'Error occurred while fetching active rides' });
  });
});

