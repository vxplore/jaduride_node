const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');
const axios = require('axios');
const dotenv = require("dotenv");
const date = require('date-and-time');
const {sendNotification} = require("./firebase-config");

const { getDriverDetails, getRideDetails, setDriverIdInRideDetails, cancelRide, updateRidePath, updateDriverCurrentStatus} = require('./database');
const {CONNECTION_KEYS, DRIVER_BOOKING_STATUS, RIDE_STATUS, RIDE_TYPE, RIDE_STAGES_FRONTEND_DRIVER, CUSTOMER_PERMISSABLE_WAITING_TIME, SOCKET_THROUGH, DRIVER_PASS_TIMER_IN_SEC, PERMISSABLE_PAYMENT_METHOD, PAYMENT_STATUS} = require('./defaultValues');

// const logger = require('./log'); 

app.get('/', function(req, res){
    // logger.error('Hello, Winston!');
    // sendNotification(
    // 'token', 
    // 'title', 
    // 'message', 
    // 'imageUrl'
    // );
    res.json('Hay');
});

app.get('/customer', (req, res) => {
    res.sendFile('F:/node/node/customer.html');
});

app.get('/driver', (req, res) => {
    res.sendFile('F:/node/node/driver.html');
});

customerIdWithSocketId = {};
driverIdWithSocketId = {};

dotenv.config();

const baseUrlCustomer = process.env.BASE_URL_CUSTOMER;
const APIKEY = process.env.APIKEY;
const baseUrl = process.env.BASE_URL;
const rideFileExtension = process.env.RIDE_FILE_EXTENSION;
const port = process.env.PORT;
const DIR_CANCEL_FOLDER = process.env.DIR_CANCEL_FOLDER;
const DIR_COMPLETED_FOLDER=process.env.DIR_COMPLETED_FOLDER;

const jaduLogo = baseUrl+'assets/images/logo_jadu.png';

// Make directory for storing todays ride details--start
var today = new Date().toLocaleDateString();
today = today.replace(new RegExp('/', 'g'),'_');
var DIR_NAME = 'rides/RIDE_'+ today;
fs.mkdir('rides', (err) => {});
fs.mkdir(DIR_NAME, (err) => {});
// Make directory for storing todays ride details--end

const toTitleCase = str => str.replace(/(^\w|\s\w)(\S*)/g, (_,m1,m2) => m1.toUpperCase()+m2.toLowerCase());

const getKeyByValue = (object, value) => { return Object.keys(object).find(key => object[key] === value) }

const deleteFromArray = (array, value) => { return array.filter(item => item !== value) }

io.on('connection', function(socket){
    // customer connected or not status sent
    console.log('connected - ' + socket.id);
    socket.emit( SOCKET_THROUGH.SEND.CONNECTION_STATUS , { 'status' : CONNECTION_KEYS['connected'] });

    socket.on(SOCKET_THROUGH.RECEIVED.AFTER_CONNECTION, (data) => {
        // console.log('Called Afterconnect........................................................');
        // data : {
        //     'id' : 'string',
        //     'type' : 'KEY_DRIVER/KEY_CUSTOMER'
        // }
        // console.log(data);
        let type = data.type;
        let id = data.id;
        
        if(type === 'KEY_CUSTOMER') customerIdWithSocketId[id] = socket.id;    
        else if(type === 'KEY_DRIVER') driverIdWithSocketId[id] = socket.id;
        
        console.log('Connected Customers : ');
        console.log(customerIdWithSocketId);

        console.log('Connected Drivers : ');
        console.log(driverIdWithSocketId);       
    });

    // on initialisation of ride
    // sent only rideId by customer, we get customerId from rideId itself
    // to get customerId from rideId we have to call Rest API
    socket.on( SOCKET_THROUGH.RECEIVED.INITIALISE_RIDE, (rideId) => {
        console.log(rideId);

        getRideDetails(rideId).then( (result) => {
            console.log(result);          
            let msg = '';
            if (typeof result !== 'undefined' && result.length === 0) { // the result is defined and has no elements
                msg = 'ride not initiated yet';
            }else{
                //have rideId, do further process
                customerId = result[0].customerId;
                origin = JSON.parse(result[0].origin);
                destination = JSON.parse(result[0].destination);
                customerOriginLat = origin.lat;
                customerOriginLng = origin.lng;

                const now = new Date(); //get cuttent date time

                let writeableData = {
                    'rideId' : rideId,
                    'customerId' : customerId,
                    'customerDetails' : {
                        'id' : customerId,
                        'name' : toTitleCase(result[0].name),
                        'image' : baseUrl + result[0].image,
                        'rating' : result[0].rating,
                        'wallet' : result[0].wallet,
                        'token' : result[0].token
                    },
                    'origin' : {
                        'lat' : origin.lat,
                        'lng' : origin.lng
                    },
                    'destination' : {
                        'lat' : destination.lat,
                        'lng' : destination.lng
                    },
                    'waypoints' : JSON.parse(result[0].waypoints),
                    'service_id' : result[0].service_id,
                    'estimateDistance' : '',
                    'rideType' : RIDE_TYPE.KEY_NORMAL,
                    'initiatedAt' : result[0].created_at,
                    'nearestDriverIds' : [],
                    'driverId' : '',
                    'rideStatus' : [{                    
                        'rideStatus' : RIDE_STATUS.RIDE_INITIATED.id,
                        'statusMsg' : RIDE_STATUS.RIDE_INITIATED.msg,
                        'rideEta' : '',
                        'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss'),
                    }]
                };
                // console.log(writeableData);
                writeableData = JSON.stringify(writeableData);
                
                fs.writeFile(DIR_NAME +'/'+ rideId + '.' +rideFileExtension, writeableData, (err) => {
                    msg = 'driver searching process starting';
                    // socket.emit('driverSearching', {'driverSearchStatus' : DRIVER_BOOKING_STATUS['neutral'], 'msg' : msg});
                    
                    io.sockets.to([customerIdWithSocketId[customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit(SOCKET_THROUGH.SEND.DRIVER_SEARCHING, {'driverSearchStatus' : DRIVER_BOOKING_STATUS['neutral'], 'msg' : msg});
                    
                    // !!ch!!
                    // io.to(customerIdWithSocketId[customerId]).emit( SOCKET_THROUGH.SEND.DRIVER_SEARCHING, {'driverSearchStatus' : DRIVER_BOOKING_STATUS['neutral'], 'msg' : msg});

                    //now start driver searching according to customer origin lat and lng
                    let url =  `${baseUrlCustomer}nearByDrivers`;
                    axios({
                        method:'get',
                        url,
                        headers: {
                            'x-api-key' : APIKEY,
                            'platform' : 'web',
                            'deviceid' : ''
                        },
                        data: {
                            "currentLocation" : {
                                "lat" : customerOriginLat,
                                "lng" : customerOriginLng
                            }
                        }
                    })
                    .then(function (response) {
                        console.log(response);
                        let getNearestDriversData = (response.data.length === 0) ? [] : response.data.nearByDrivers;

                        fs.readFile(DIR_NAME +'/'+ rideId+ '.' +rideFileExtension, 'utf-8', (err, data) => {
                            data = JSON.parse(data);

                            let nearByDriversIdArray = [];  
            
                            for(let i = 0; i < getNearestDriversData.length; i++){
                                nearByDriversIdArray.push(getNearestDriversData[i].id);
                            }

                            data.nearestDriverIds = nearByDriversIdArray;
                            data = JSON.stringify(data);

                            

                            fs.writeFile(DIR_NAME +'/'+ rideId+ '.' +rideFileExtension, data, (err) => {
                                if(getNearestDriversData.length === 0){                        
                                    msg = 'no driver found';
                                    // socket.emit('driverSearching', {'driverSearchStatus' : DRIVER_BOOKING_STATUS['not_found'], 'msg' : msg});
                                    
                                    // !!ch!!
                                    io.sockets.to([customerIdWithSocketId[customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit(SOCKET_THROUGH.SEND.DRIVER_SEARCHING, {'driverSearchStatus' : DRIVER_BOOKING_STATUS['not_found'], 'msg' : msg});
                                }else{
                                    sendRequestToDriver(rideId);
                                }
                            });

                        });
                    })
                    .catch(function (error) {
                        console.log(error);
                    });
                });
            }
        });
    });

    socket.on( SOCKET_THROUGH.RECEIVED.UPDATE_RIDE_LOCATION, (data) => {
        console.log('update ride location');
        // data = {
        //     'rideId' : '',
        //     'waypoints' : [
        //         {
        //             'lat' : double,
        //             'lng' : double
        //         }
        //     ],
        //     'destination' : {
        //         'lat' : double,
        //         'lng' : double
        //     }
        // }
        updateRidePath(data.rideId, data.waypoints, data.destination).then((result) => {
            console.log(result);
            if(result){
                fs.readFile(DIR_NAME +'/'+ data.rideId + '.' + rideFileExtension, 'utf-8', (err, resData) => {            
                    resData = JSON.parse(resData);

                    resData.waypoints = data.waypoints;
                    resData.destination = data.destination;

                    let driverId = resData.driverId;

                    let dropNavigationData = {
                        'waypoints' : resData.waypoints,
                        'destination' : resData.destination
                    };
                    console.log(dropNavigationData);
                    io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.RIDE_DROP_NAVIGATION, dropNavigationData);

                    resData = JSON.stringify(resData);
                    fs.writeFile(DIR_NAME +'/'+ data.rideId+ '.' + rideFileExtension, resData ,(err) => {
                        console.log('updated ride path');
                        // resData.destination.lat = parseFloat(resData.destination.lat);
                        // resData.destination.lng = parseFloat(resData.destination.lng);
                    });
                });
            }
        });
    });

    function sendRequestToDriver(rideId){ 
        fs.readFile(DIR_NAME +'/'+ rideId+ '.' +rideFileExtension, 'utf-8', (err, data) => {
            data = JSON.parse(data);

            let nearByDriversIdArray = data.nearestDriverIds; 

            // previously this data - now not required - start
            // 'pickUpLocation' : 'abcd',
            // 'estimateDistance' : '15 km',
            // 'eta' : '10 mins',
            // previously this data - now not required - end

            if(nearByDriversIdArray.length > 0){
                let requestDriverData = {
                    'rideId' : data.rideId,
                    'vehicleType' : data.service_id,                    
                    'passTimer' : DRIVER_PASS_TIMER_IN_SEC,                    
                    'lat' : parseFloat(data.origin.lat),
                    'lng' : parseFloat(data.origin.lng),
                    'customerDetails' : data.customerDetails
                };
    
                console.log(nearByDriversIdArray);
    
                let nearestDriversArraySocketIds = [];
                for(let i = 0; i < nearByDriversIdArray.length; i++)
                    nearestDriversArraySocketIds.push(driverIdWithSocketId[nearByDriversIdArray[i]]);
    
                console.log(nearestDriversArraySocketIds);
                io.sockets.to(nearestDriversArraySocketIds).emit( SOCKET_THROUGH.SEND.RIDE_REQUEST, requestDriverData);
            }
        });
    }

    socket.on( SOCKET_THROUGH.RECEIVED.TRIGGERRIDE_RESPONSE, (data)=>{
        // Response data
        // data = {
        //     'rideId' : '6776456',
        //     'status' : 'BOOKING_ACCEPT',
        //     'driverId' : ''
        // }
        let r = data.rideId;
        if( fs.existsSync(DIR_NAME +'/'+ r + '.' + rideFileExtension) ){ 
            console.log('triggered triggerRideResponse');
            
            fs.readFile(DIR_NAME +'/'+ r + '.' +rideFileExtension, 'utf-8', (err, resData) => {
                resData = JSON.parse(resData);

                let nearestDriversArray = resData.nearestDriverIds;

                let afterDriverAcceptenceDriverArray = deleteFromArray(nearestDriversArray, data.driverId);

                let nearestPassDriversArraySocketIds = [];
                for(let i = 0; i < afterDriverAcceptenceDriverArray.length; i++)
                    nearestPassDriversArraySocketIds.push(driverIdWithSocketId[afterDriverAcceptenceDriverArray[i]]);
                
                if(data.status == 'BOOKING_ACCEPT'){
                    // this emmition for those drivers whome not accepted ride request to close the ride request pop-up window
                    io.sockets.to(nearestPassDriversArraySocketIds).emit( SOCKET_THROUGH.SEND.AFTER_RIDE_ACCEPTED, {'status' : 'BOOKING_PASS', 'msg' : 'Someone was already accept this ride'});

                    resData.driverId = data.driverId;

                    setDriverData = {'rideId' : data.rideId, 'driverId' : data.driverId};

                    if(setDriverIdInRideDetails(setDriverData)){
                        
                        // io.sockets.emit('driverSearching', {'driverSearchStatus' : DRIVER_BOOKING_STATUS['found'], 'msg' : 'driver found'});
                        console.log('#############---------------------------Driver found-----------------------################');   

                        //  !!ch!!
                        io.sockets.to([customerIdWithSocketId[resData.customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit(SOCKET_THROUGH.SEND.DRIVER_SEARCHING, {'driverSearchStatus' : DRIVER_BOOKING_STATUS['found'], 'msg' : 'Driver found'});
                        // io.to(customerIdWithSocketId[resData.customerId]).emit(SOCKET_THROUGH.SEND.DRIVER_SEARCHING, {'driverSearchStatus' : DRIVER_BOOKING_STATUS['found'], 'msg' : 'driver found'});
                        
                        getDriverDetails(data.driverId, data.rideId).then( (result) => {
                            console.log(result);
                            if( Array.isArray(result) && result.length > 0){
                                result = result[0];
                                let rideDetails = {
                                    'otp' : result.otp,
                                    'paymentMethod' : toTitleCase(result.paymentMethod),
                                    'fare' : result.fare,
                                    'driverDetails' : {
                                        'name' : toTitleCase(result.name),
                                        'image' : (result.image === null || result.image.trim() === "") ? 'https://media-exp1.licdn.com/dms/image/C5103AQFdCjTP_SsZAQ/profile-displayphoto-shrink_200_200/0/1549029612231?e=1669852800&v=beta&t=gP3KYKqIAb5Md2pqEEutrxRqjl4p3308pQpA3m9-_pk' : result.image,
                                        'totalTrips' : '0',
                                        'carName' : toTitleCase('swift dzire'),
                                        'cabNumber' : result.vehicle_number,
                                        'rating' : result.rating,
                                        'qrCode' : baseUrl + result.qrCode,
                                        'wallet' : result.wallet,
                                        'token' : result.token
                                    }
                                };


                                // Send notificaton to customer start
                                let title = toTitleCase(result.name) + ' | ' + result.vehicle_number;
                                let msg = 'Driver found';
                                let image = result.image;
                                let action = 'click';

                                let token = resData.customerDetails.token;
                                if(token != null || token != 'null'){
                                    console.log(token);
                                    sendNotification(token, title, msg, image,
                                        {
                                            title : title,
                                            body : msg,
                                            image : image,
                                            largeIcon : image,
                                            action : action
                                        }
                                    );
                                }
                                // Send notification to customer end



                                console.log(rideDetails);
                                const now = new Date(); //get cuttent date time
                                let rideStatusData = {
                                    'rideStatus' : RIDE_STATUS.RIDE_ARRIVING.id,
                                    'statusMsg' : RIDE_STATUS.RIDE_ARRIVING.msg,
                                    'rideEta' : '6 mins',
                                    'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss'),
                                };

                                resData.rideStatus.push(rideStatusData);

                                resData.rideDetails = rideDetails;

                                let rideNavigationData = {
                                    'customerName' : resData.customerDetails.name,
                                    'currentStage' : RIDE_STAGES_FRONTEND_DRIVER.PICKUP,
                                    'serviceId' : resData.service_id,
                                    'pickUpLocation': resData.origin
                                };
                                
                                console.log(rideStatusData);
                                
                                //  !!ch!!
                                io.sockets.to([customerIdWithSocketId[resData.customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit( SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);
                                io.sockets.to([customerIdWithSocketId[resData.customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit( SOCKET_THROUGH.SEND.ACCEPTED_DRIVER_DETAILS, rideDetails);

                                resData = JSON.stringify(resData);
                                fs.writeFile(DIR_NAME +'/'+ data.rideId+ '.' +rideFileExtension, resData ,(err) => {
                                    console.log('--update file ');
                                    console.log(err);

                                    let rideCurrentDriver = [];
                                    rideCurrentDriver.push(driverIdWithSocketId[data.driverId]);
                                    
                                    console.log(rideCurrentDriver);
                                    
                                    console.log(rideNavigationData);
                                    io.sockets.to(rideCurrentDriver).emit(SOCKET_THROUGH.SEND.RIDE_NAVIGATION, rideNavigationData);
                                });
                            
                            }else{
                                io.to(driverIdWithSocketId[data.driverId]).emit( SOCKET_THROUGH.SEND.RIDE_CANCELLED, { //send to driver
                                    'rideStatus' : RIDE_STATUS.RIDE_CANCELLED.id,
                                    'statusMsg' : RIDE_STATUS.RIDE_CANCELLED.msg,
                                    'isCancelled' : true
                                });
                            }
                        });
                    }                
                }
            }); 
        }       
    }); 

    socket.on( SOCKET_THROUGH.RECEIVED.UPDATECURRENT_LOCATION, (data) =>{ //from driver
        // data = {
        //     'rideId' : '',
        //     'currentLocation' : {
        //         'lat' : '',
        //         'lng' : ''
        //     },
        //     'driverId' : '',
        //     'customerId' : ''
        // }
        let location = {
            "lat": parseFloat(data.currentLocation.lat),
            "lng": parseFloat(data.currentLocation.lng)
        }
        io.to(customerIdWithSocketId[data.customerId]).emit('driverLiveLocation', location);
    });

    socket.on( SOCKET_THROUGH.RECEIVED.CANCEL_RIDE, (rideId) => {  //from c
        console.log('Ride is cancelled : ' + rideId);
        let oldFileNameWithPath = DIR_NAME + '/' + rideId + '.' + rideFileExtension;
        let newFileNameWithPath = DIR_NAME + '/'  + DIR_CANCEL_FOLDER + '/' + rideId + '.' + rideFileExtension;

        if( fs.existsSync(oldFileNameWithPath) ){ 
            fs.mkdir(DIR_NAME +'/' + DIR_CANCEL_FOLDER, (err) => {
                fs.rename(oldFileNameWithPath, newFileNameWithPath, (err) => {
                    fs.readFile(newFileNameWithPath, 'utf-8', (err, resData) => {
                        resData = JSON.parse(resData);

                        let alreadyCancelled = false;   

                        if(resData.rideStatus.length === 1 ){    
                            alreadyCancelled = true;                                
                            let nearestDriversArraySocketIds = [];
                            let nearByDriversIdArray = resData.nearestDriverIds;
                            for(let i = 0; i < nearByDriversIdArray.length; i++)
                                nearestDriversArraySocketIds.push(driverIdWithSocketId[nearByDriversIdArray[i]]);

                            io.sockets.to(nearestDriversArraySocketIds).emit( SOCKET_THROUGH.SEND.AFTER_RIDE_ACCEPTED, {'status' : 'BOOKING_PASS', 'msg' : 'Customer cancel this ride'});
                            console.log('ride cancel trigger before any driver accept');
                        }

                        const now = new Date(); //get cuttent date time
                        let rideStatusData = {
                            'rideStatus' : RIDE_STATUS.RIDE_CANCELLED.id,
                            'statusMsg' : RIDE_STATUS.RIDE_CANCELLED.msg,
                            'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss'),
                        };

                        resData.rideStatus.push(rideStatusData);
                        let driverId = resData.driverId;
                        resData = JSON.stringify(resData);

                        fs.writeFile(newFileNameWithPath, resData ,(err) => {                            
                            cancelRide(rideId, driverId, 'normal').then((result) => {
                                if(!alreadyCancelled){                                
                                    console.log('ride cancel after driver accept');
                                    io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.RIDE_CANCELLED, { //send to driver
                                        'rideStatus' : RIDE_STATUS.RIDE_CANCELLED.id,
                                        'statusMsg' : RIDE_STATUS.RIDE_CANCELLED.msg,
                                        'isCancelled' : result
                                    });                                
                                }
                            });
                        });
                    });
                });
            });
        }
    });    

    socket.on( SOCKET_THROUGH.RECEIVED.ONRIDE , (data) => { //from driver
        // data = {
        //     'rideId' : '',
        //     'type' : 'KEY_CLIENT_LOCATED',            
        // }
        let type = data.type;
        rideId = data.rideId;

        fs.readFile(DIR_NAME + '/' + rideId + '.' + rideFileExtension, 'utf-8', (err, resData) => {
            resData = JSON.parse(resData);            
            let driverId = resData.driverId;
            const now = new Date(); //get cuttent date time
            let rideStatusData;

            if(type === 'KEY_CLIENT_LOCATED'){
                let clientLocatedData = {
                    "rideStage" : RIDE_STAGES_FRONTEND_DRIVER.WAITING,
                    "waitingTime": {
                        "min": CUSTOMER_PERMISSABLE_WAITING_TIME.min,
                        "second": CUSTOMER_PERMISSABLE_WAITING_TIME.sec
                    }
                };
    
                rideStatusData = {
                    'rideStatus' : RIDE_STATUS.RIDE_ARRIVED.id,
                    'statusMsg' : RIDE_STATUS.RIDE_ARRIVED.msg,
                    'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss')
                };

                // Send notificaton to customer start
                let title = `Cab arrived | OTP - ${resData.rideDetails.otp}`;
                let msg = 'Cab reached at pickup location';
                let image = jaduLogo;
                let action = 'click';

                let token = resData.customerDetails.token;
                if(token != null || token != 'null'){
                    console.log(token);
                    sendNotification(token, title, msg, image,
                        {
                            title : title,
                            body : msg,
                            image : image,
                            largeIcon : image,
                            action : action
                        }
                    );
                }
                // Send notification to customer end

                io.sockets.to([customerIdWithSocketId[resData.customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit( SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);   // emit to c

                io.to(driverIdWithSocketId[resData.driverId]).emit( SOCKET_THROUGH.SEND.CLIENT_LOCATED, clientLocatedData );  // emit to d
            }else if(type === 'KEY_END_TRIP'){
                rideStatusData = {
                    'rideStatus' : RIDE_STATUS.RIDE_COMPLETED.id,
                    'statusMsg' : RIDE_STATUS.RIDE_COMPLETED.msg,
                    'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss')
                };

                console.log('RIDE_COMPLETED--------------------------------------------------------------------XXX');
                console.log(rideStatusData);
                
                //  !!ch!!
                io.sockets.to([customerIdWithSocketId[resData.customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit( SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);   // emit to c
            }

            resData.rideStatus.push(rideStatusData);

            resData = JSON.stringify(resData);
            fs.writeFile(DIR_NAME + '/' + rideId + '.' + rideFileExtension, resData, (err) => {
                if(err) throw err;
                console.log('file updates');
            });

            if(type === 'KEY_END_TRIP'){ //when we end trip then json file move to completed folder
                
                console.log('congrats  - trip end.........');

                let oldFileNameWithPath = DIR_NAME + '/' + rideId + '.' + rideFileExtension;
                let newFileNameWithPath = DIR_NAME + '/'  + DIR_COMPLETED_FOLDER + '/' + rideId + '.' + rideFileExtension;

                console.log('oldpath : ' + oldFileNameWithPath);
                console.log('newpath : ' + newFileNameWithPath);

                if( fs.existsSync(oldFileNameWithPath) ){ 
                    fs.mkdir(DIR_NAME + '/' + DIR_COMPLETED_FOLDER, (err) => {
                        fs.rename(oldFileNameWithPath, newFileNameWithPath, (err) => {
                            updateDriverCurrentStatus(driverId, 'DRIVER_WAITING').then((result) => {
                                console.log(
                                    (result) 
                                        ?
                                        'Driver released from ride... now driver allowed to get ride'
                                        :
                                        'Some error occoured to release driver from ride'
                                );
                                fs.readFile(newFileNameWithPath, 'utf-8', (err, resData) => {            
                                    resData = JSON.parse(resData);
                                    console.log(`ride fare to driver ${driverId}`);
                                    let rideFareDate = {
                                        'totalFare' : resData.rideDetails.fare,
                                        'qRCode' : resData.rideDetails.driverDetails.qrCode
                                    };
                                    console.log(rideFareDate);
                                    io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.TOTAL_RIDE_FARE, rideFareDate);
                                    io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.PAYMENT_ACCEPTANCE_CONTROL, false);
                                });
                            });
                        });
                    });
                }
            }
        });

        
    });

    socket.on( SOCKET_THROUGH.RECEIVED.VERIFY_OTP, (data) => {
        console.log('called ---  verifyOtp');
        console.log(data);

        let otp = data.otp;
        let rideId = data.rideId;
        let driverId = data.driverId;

        const now = new Date(); //get cuttent date time
        
        fs.readFile(DIR_NAME +'/'+ rideId + '.' + rideFileExtension, 'utf-8', (err, resData) => {            
            resData = JSON.parse(resData);

            let rideOriginalOtp = resData.rideDetails.otp;

            let checkOtpResponse = {
                'status' : false,
                'msg' : 'Otp mismatched, ask customer to give proper OTP'
            };

            if(rideOriginalOtp === otp){
                checkOtpResponse = {
                    'status' : true,
                    'msg' : 'Otp matched'
                };

                let rideStatusData = {
                    'rideStatus' : RIDE_STATUS.RIDE_STARTED.id,
                    'statusMsg' : RIDE_STATUS.RIDE_STARTED.msg,
                    'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss')
                };
                
                io.sockets.to([customerIdWithSocketId[resData.customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit( SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);   // emit to c             
                
                for(let status of resData.rideStatus){
                    if(status.rideStatus === RIDE_STATUS.RIDE_ARRIVED.id){
                        let driverArrivedTime = new Date(status.dateTime);
                        let rideStartTime = new Date(date.format(now, 'YYYY-MM-DD HH:mm:ss'));
                        let driverWaitingTimeInMiliSec = rideStartTime - driverArrivedTime;
                        let totalOriginalCUSTOMER_PERMISSABLE_WAITING_TIME = ( parseInt(CUSTOMER_PERMISSABLE_WAITING_TIME.min) * 60000 ) +  ( parseInt(CUSTOMER_PERMISSABLE_WAITING_TIME.sec) * 1000);
                        
                        let driverWaitingTime = {};

                        if(driverWaitingTimeInMiliSec > totalOriginalCUSTOMER_PERMISSABLE_WAITING_TIME){
                            // Waiting charges applied 
                            console.log(totalOriginalCUSTOMER_PERMISSABLE_WAITING_TIME);
                            let time = (parseInt(driverWaitingTimeInMiliSec) - parseInt(totalOriginalCUSTOMER_PERMISSABLE_WAITING_TIME) );
                            console.log('Extra time :' + time);

                            driverWaitingTime.extratimeInMiliSec = time;
                            resData.waitingTime = driverWaitingTime;
                        }
                        driverWaitingTime.driverWaitingTimeInMiliSec = driverWaitingTimeInMiliSec;
                        console.log('driver waiting time : ' + driverWaitingTimeInMiliSec);
                    }
                }
                resData.rideStatus.push(rideStatusData);          
            }

            console.log('send to driver otp verification result');

            // !!ch!! 
            io.sockets.to([ driverIdWithSocketId[driverId], driverIdWithSocketId['DRIVER_fe1ccf453534542c3a038a48_16584789911'] ]).emit( SOCKET_THROUGH.SEND.IS_OTP_VERIFIED, checkOtpResponse); 
            // io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.IS_OTP_VERIFIED, checkOtpResponse);               
           
            if(rideOriginalOtp === otp){
                resData.destination.lat = parseFloat(resData.destination.lat);
                resData.destination.lng = parseFloat(resData.destination.lng);
                
                let dropNavigationData = {
                    'waypoints' :resData.waypoints,
                    'destination' : resData.destination
                };
                console.log(dropNavigationData);
                io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.RIDE_DROP_NAVIGATION, dropNavigationData);
            }

            resData = JSON.stringify(resData);
            fs.writeFile(DIR_NAME +'/'+ rideId + '.' + rideFileExtension, resData ,(err) => {});
        });
    });

    socket.on(SOCKET_THROUGH.RECEIVED.INITIATE_RIDE_PAYMENT, (data) => {
        // data = {
        //     'rideId' : '',            
        //     'selectedMethod' : '',
        //     'amount' : ''            
        // }
        fs.readFile(DIR_NAME + '/'  + DIR_COMPLETED_FOLDER + '/' + data.rideId + '.' +rideFileExtension, 'utf-8', (err, resData) => {
            resData = JSON.parse(resData);
            let paymentDetails;

            let paymentStatusData;

            const now = new Date();
            if(data.selectedMethod == PERMISSABLE_PAYMENT_METHOD.METHOD_CASH || data.selectedMethod == PERMISSABLE_PAYMENT_METHOD.METHOD_WALLET){
                paymentDetails = {
                    method : data.selectedMethod,
                    amount : data.amount,                    
                    status : [{ 
                        status : PAYMENT_STATUS.LOADING,
                        dateTime : date.format(now, 'YYYY-MM-DD HH:mm:ss'),
                    }]
                }
                resData.paymentDetails = paymentDetails;

                if(data.selectedMethod == PERMISSABLE_PAYMENT_METHOD.METHOD_CASH){
                    paymentStatusData = {
                        'status' : PAYMENT_STATUS.LOADING, 
                        'message' : 'Waiting for driver acceptence'
                    }

                    io.sockets.to([customerIdWithSocketId[resData.customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit(SOCKET_THROUGH.SEND.PAYMENT_STATUS, paymentStatusData);
                    io.to(driverIdWithSocketId[resData.driverId]).emit( SOCKET_THROUGH.SEND.PAYMENT_ACCEPTANCE_CONTROL, true);

                }else if(data.selectedMethod == PERMISSABLE_PAYMENT_METHOD.METHOD_WALLET){
                    io.to(driverIdWithSocketId[resData.driverId]).emit( SOCKET_THROUGH.SEND.PAYMENT_ACCEPTANCE_CONTROL, false);
                    paymentStatusData = {
                        'status' : PAYMENT_STATUS.LOADING, 
                        'message' : 'Transaction being processed...\nPlease wait....'
                    }
                    // check amount available is wallet of customer
                    // deduct amount from customer wallet
                    // add amount to that rided driver wallet
                    // update ''''history_wallet_transactions'''' and ''''history_ride_transactions'''' table
                    let amountInCustomerWallet = resData.customerDetails.wallet;

                    if( parseFloat(amountInCustomerWallet) < parseFloat(data.amount) ){
                        paymentStatusData = {
                            'status' : PAYMENT_STATUS.FAILURE,
                            'message' : 'Insufficent amount in your wallet'
                        };
                        io.sockets.to([customerIdWithSocketId[resData.customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit(SOCKET_THROUGH.SEND.PAYMENT_STATUS, paymentStatusData);
                    }else{
                        let amountInDriverWallet = resData.rideDetails.driverDetails.wallet;
                        // console.log(resData);
                        let newAmountInDriverWallet = parseFloat(amountInDriverWallet) + parseFloat(data.amount);
                        let newAmountInCustomerWallet = parseFloat(amountInCustomerWallet) - parseFloat(data.amount);
                        console.log(newAmountInDriverWallet);
                        console.log(newAmountInCustomerWallet);
                        
                        // axios --start
                        let url =  `https://jaduridedev.v-xplore.com/customers/rideTransactionThroughWallet`;
                        let postData = {
                            rideId : data.rideId, 
                            customerId : resData.customerId, 
                            driverId : resData.driverId, 
                            amount : data.amount,
                            newAmountInDriverWallet : newAmountInDriverWallet, 
                            newAmountInCustomerWallet : newAmountInCustomerWallet
                        };

                        axios({
                            method:'post',
                            url,
                            headers: {
                                'x-api-key' : APIKEY,
                                'platform' : 'web',
                                'deviceid' : '',                                
                            },
                            data: postData
                        })
                        .then( (response) => {
                            // console.log(response.data);
                            paymentStatusData = {
                                'status' : PAYMENT_STATUS.SUCCESS,
                                'message' : 'Payments done, Thank you...',
                            };
                            completeRidePayment(data.rideId);
                            io.sockets.to([customerIdWithSocketId[resData.customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit(SOCKET_THROUGH.SEND.PAYMENT_STATUS, paymentStatusData);
                        })
                        .catch((response)=>{
                            console.log(response);
                        });
                        // axios --end
                    }
                }
            }           

            // let customerId = resData.customerId;
            resData = JSON.stringify(resData);
            fs.writeFile(DIR_NAME + '/'  + DIR_COMPLETED_FOLDER + '/' + data.rideId+ '.' + rideFileExtension, resData ,(err) => {
                console.log('Payment initiated');
                // !!ch!!
                // io.sockets.to([customerIdWithSocketId[customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit(SOCKET_THROUGH.SEND.PAYMENT_STATUS, paymentStatusData);
            });
        });
    });

    socket.on(SOCKET_THROUGH.RECEIVED.COMPLETE_RIDE_PAYMENT, (rideId) => {
        completeRidePayment(rideId);
    });

    const completeRidePayment = (rideId) => {
        fs.readFile(DIR_NAME + '/'  + DIR_COMPLETED_FOLDER + '/' + rideId + '.' +rideFileExtension, 'utf-8', (err, resData) => {
            resData = JSON.parse(resData);
            const now = new Date();
            let status = { 
                status : PAYMENT_STATUS.SUCCESS,
                dateTime : date.format(now, 'YYYY-MM-DD HH:mm:ss'),
            }
            if(typeof resData.paymentDetails.status != 'undefined'){
                resData.paymentDetails.status.push(status);
                let driverId = resData.driverId;
                let customerId = resData.customerId;
                let fare = resData.rideDetails.fare;
                let driverName = resData.rideDetails.driverDetails.name;
                resData = JSON.stringify(resData);
                fs.writeFile(DIR_NAME + '/'  + DIR_COMPLETED_FOLDER + '/' + rideId+ '.' + rideFileExtension, resData ,(err) => {
                    console.log('Payment successful');
                    //  !!ch!!
                    io.sockets.to([customerIdWithSocketId[customerId], customerIdWithSocketId['ab3a094fd876138f6871060b6ba2a7621659098221']]).emit(SOCKET_THROUGH.SEND.PAYMENT_STATUS, {
                        'status' : PAYMENT_STATUS.SUCCESS, 
                        'message' : `Payment of ₹ ${fare} to ${driverName} Successfull`
                    });
                    io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.AFTER_PAYMENT, true);
                });
            }
        });
    }

    socket.on( SOCKET_THROUGH.RECEIVED.DISCONNECTING, () => {
        console.log('Disconnected : ' + socket.id);
        let key_driver = getKeyByValue(driverIdWithSocketId, socket.id);

        let key_customer = getKeyByValue(customerIdWithSocketId, socket.id);

        if(key_driver != 'undefined'){
            if(driverIdWithSocketId.hasOwnProperty(key_driver))    delete driverIdWithSocketId[key_driver];
        }

        if(key_customer != 'undefined'){
            if(customerIdWithSocketId.hasOwnProperty(key_customer))    delete customerIdWithSocketId[key_customer];
        }

        console.log('Customers : ');
        console.log(customerIdWithSocketId);
        
        console.log('Driver : ');
        console.log(driverIdWithSocketId);
    });
});

http.listen(port, function(){
   console.log(`listening on localhost:${port}`);
});