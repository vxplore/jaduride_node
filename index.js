const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');
const axios = require('axios');
const dotenv = require("dotenv");
const date = require('date-and-time');

const {sendNotification} = require("./firebase-config");

const {
    getDriverDetails,
    getRideDetails,
    setDriverIdInRideDetails,
    cancelRide,
    updateRidePath,
    updateDriverCurrentStatus,
    getScheduleRideData,
    checkDriverAlreadyInARide
} = require('./database');

const {
    CONNECTION_KEYS,
    DRIVER_BOOKING_STATUS,
    RIDE_STATUS,
    RIDE_TYPE,
    RIDE_STAGES_FRONTEND_DRIVER,
    CUSTOMER_PERMISSABLE_WAITING_TIME,
    SOCKET_THROUGH,
    DRIVER_PASS_TIMER_IN_SEC,
    PERMISSABLE_PAYMENT_METHOD,
    PAYMENT_STATUS,
    SERVICE,
    STATIC_SKIP
} = require('./defaultValues');

// const logger = require('./log');

app.get('/', function(req, res){   
    res.json('Hay');
    // let rideId = req.query.rideId;
    // let driverId = req.query.driverId;

    // for (let index = 0; index < 100; index++) {    
    //     getDriverDetails(driverId, rideId).then((result)=>{
    //         // res.json(result);
    //         console.log(result);
    //     });
    // }
});

app.get('/customer', (req, res) => {
    console.log(req);
    // res.sendFile('C:/Users/v-xplore/Documents/GitHub/jaduride_node/customer.html');
});

customerIdWithSocketId = {};
driverIdWithSocketId = {};
adminIdWithSocketIdForOnCallBooking = {};
mainScreen = {};

dotenv.config();

const baseUrlCustomer = process.env.BASE_URL_CUSTOMER;
const APIKEY = process.env.APIKEY;
const baseUrl = process.env.BASE_URL;
const rideFileExtension = process.env.RIDE_FILE_EXTENSION;
const port = process.env.PORT;
const DIR_CANCEL_FOLDER = process.env.DIR_CANCEL_FOLDER;
const DIR_COMPLETED_FOLDER=process.env.DIR_COMPLETED_FOLDER;

const jaduLogo = baseUrl + 'assets/images/logo_jadu.png';
const noDriverImage = baseUrl + 'assets/images/no-driver.png';

const soundNormal = baseUrl + 'assets/sound/beep.mp3';
const soundEmergency = baseUrl + 'assets/sound/siren-emergency.mp3';

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

const arePointsNear = (checkPoint, centerPoint, km) =>{
    var ky = 40000 / 360;
    var kx = Math.cos(Math.PI * centerPoint.lat / 180.0) * ky;
    var dx = Math.abs(centerPoint.lng - checkPoint.lng) * kx;
    var dy = Math.abs(centerPoint.lat - checkPoint.lat) * ky;
    return Math.sqrt(dx * dx + dy * dy) <= km;
}

const getRideCount = (DIR) => {
    if(fs.existsSync(DIR)){
        return fs.readdirSync(DIR, {withFileTypes: true})
        .filter(item => !item.isDirectory())
        .map(item => item.name).length;
    }
    return 0;
}

setInterval(()=>{   //schedule ride iplementation
    console.log('call schedule ride');
    
    const now = new Date();
    console.log(date.format(now, 'YYYY/MM/DD HH:mm:ss'));

    getScheduleRideData().then( (result) => {
        if(result.length != 0){
            let rideId = result[0].uid;
            console.log(rideId);
            initiateRide(rideId);
        }
    });
},1800000);// 1800000 // miliseconds = 30 minutes



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

        if(type === 'KEY_CUSTOMER'){
            customerIdWithSocketId[id] = socket.id;
            sendRideControlEvent(id);
        }else if(type === 'KEY_DRIVER'){
            driverIdWithSocketId[id] = socket.id;  
            driverAlreadyInARide(id);          
        }
        else if(type === 'KEY_ADMIN') adminIdWithSocketIdForOnCallBooking[id] = socket.id;
        else if(type === 'KEY_MAIN_SCREEN') mainScreen[id] = socket.id;

        console.log('Connected Customers : ');
        console.log(customerIdWithSocketId);

        console.log('Connected Drivers : ');
        console.log(driverIdWithSocketId);

        console.log('Connected Admins : ');
        console.log(adminIdWithSocketIdForOnCallBooking);

        console.log('Connected Main Screen : ');
        console.log(mainScreen);

        sendMainScreenData();        
    });

    const sendMainScreenData = () => {
        let mainScreenData = {
            'connectedDrivers' : Object.keys(driverIdWithSocketId).length,
            'connectedCustomers' :  Object.keys(customerIdWithSocketId).length,
            'totalOngoingRides' : getRideCount(DIR_NAME),
            'totalCompleteRides' : getRideCount(DIR_NAME + '/'  + DIR_COMPLETED_FOLDER),
            'totalCancelledRides' : getRideCount(DIR_NAME + '/'  + DIR_CANCEL_FOLDER)
        };
        io.to(mainScreen['MAIN_SCREEN_1234']).emit(SOCKET_THROUGH.SEND.MAIN_SCREEN_DATA, mainScreenData);
    }

    socket.on(SOCKET_THROUGH.RECEIVED.DRIVER_CHECK_DRIVER_ALREADY_IN_A_RIDE, (driverId) => {
        console.log('DRIVER_CHECK_DRIVER_ALREADY_IN_A_RIDE');
        driverAlreadyInARide(driverId);
    });

    const driverAlreadyInARide = (driverId) => {
        checkDriverAlreadyInARide(driverId).then( (rideId) => {
            if( rideId != ''){
                let fileLocation = DIR_NAME +'/'+ rideId + '.' + rideFileExtension;
                let completedFileLocation =  DIR_NAME + '/'  + DIR_COMPLETED_FOLDER + '/' + rideId + '.' + rideFileExtension;

                let getOriginalFileLocation = (fs.existsSync(fileLocation)) ? fileLocation : (fs.existsSync(completedFileLocation)) ? completedFileLocation : '';

                if(fs.existsSync(getOriginalFileLocation)){
                    fs.readFile(getOriginalFileLocation, 'utf-8', (err, resData) => {
                        resData = JSON.parse(resData);

                        let rideStatus = resData.rideStatus;
                        let rideStatusData = rideStatus[rideStatus.length - 1];
                        let rideExactStatus = rideStatusData.rideStatus;

                        console.log(rideExactStatus);

                        if(rideExactStatus == RIDE_STATUS.RIDE_ARRIVING.id){
                            let rideNavigationData = {
                                'rideId' : rideId,
                                'customerName' : resData.customerDetails.name,
                                'currentStage' : RIDE_STAGES_FRONTEND_DRIVER.PICKUP,
                                'serviceId' : resData.service_id,
                                'pickUpLocation': resData.origin,
                                'skipOnRideEmission' : STATIC_SKIP.NO
                            };
                            io.to(driverIdWithSocketId[driverId]).emit(SOCKET_THROUGH.SEND.RIDE_NAVIGATION, rideNavigationData);
                        }else if(rideExactStatus == RIDE_STATUS.RIDE_ARRIVED.id){
                            let rideNavigationData = {
                                'rideId' : rideId,
                                'customerName' : resData.customerDetails.name,
                                'currentStage' : RIDE_STAGES_FRONTEND_DRIVER.PICKUP,
                                'serviceId' : resData.service_id,
                                'pickUpLocation': resData.origin,
                                'skipOnRideEmission' : STATIC_SKIP.YES
                            };                            
                            io.to(driverIdWithSocketId[driverId]).emit(SOCKET_THROUGH.SEND.RIDE_NAVIGATION, rideNavigationData);
                        }else if(rideExactStatus == RIDE_STATUS.RIDE_STARTED.id){
                            let rideNavigationData = {
                                'rideId' : rideId,
                                'customerName' : resData.customerDetails.name,
                                'currentStage' : RIDE_STAGES_FRONTEND_DRIVER.ONGOING,
                                'serviceId' : resData.service_id,
                                'pickUpLocation': resData.origin,
                                'skipOnRideEndEmission' : STATIC_SKIP.NO
                            };
                            io.to(driverIdWithSocketId[driverId]).emit(SOCKET_THROUGH.SEND.RIDE_NAVIGATION, rideNavigationData);

                            resData.destination.lat = parseFloat(resData.destination.lat);
                            resData.destination.lng = parseFloat(resData.destination.lng);

                            let dropNavigationData = {
                                'waypoints' :resData.waypoints,
                                'destination' : resData.destination
                            };
                            console.log(dropNavigationData);
                            sendDriverRideDropNavigation(dropNavigationData, driverId);
                        }else if(rideExactStatus == RIDE_STATUS.RIDE_ON_INITIATE_PAYMENT.id){
                            let rideNavigationData = {
                                'rideId' : rideId,
                                'customerName' : resData.customerDetails.name,
                                'currentStage' : RIDE_STAGES_FRONTEND_DRIVER.COMPLETED,
                                'serviceId' : resData.service_id,
                                'pickUpLocation': resData.origin,
                                'skipOnRideEndEmission' : STATIC_SKIP.YES
                            };
                            io.to(driverIdWithSocketId[driverId]).emit(SOCKET_THROUGH.SEND.RIDE_NAVIGATION, rideNavigationData);
                            paymentLogicInitiated(resData, driverId);
                        }
                    });
                }
            }
        });
    }

    // on initialisation of ride
    // sent only rideId by customer, we get customerId from rideId itself
    // to get customerId from rideId we have to call Rest API
    socket.on( SOCKET_THROUGH.RECEIVED.INITIALISE_RIDE, (rideId) => {
        console.log('INITIATE_RIDE CALLED');
        initiateRide(rideId);
    });

    socket.on( SOCKET_THROUGH.RECEIVED.INITIALISE_EMERGENCY_RIDE_DRIVER, (data) => {
        console.log('INITIATE_RIDE CALLED EMERGENCY DRIVER');
        let rideId = data.rideId;
        let serviceId = data.serviceId;
        let driverId = data.serviceId;
        initiateRide(rideId, serviceId, driverId);
    });

    const initiateRide = (rideId, serviceId = '', driverId= '') => {
        console.log(rideId);

        getRideDetails(rideId, serviceId, driverId).then( (result) => {
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
                let serviceTypeId = result[0].serviceTypeId;

                const now = new Date(); //get cuttent date time
                let rideType = (result[0].rideType == 'ride_schedule') ? RIDE_TYPE.KEY_SCHEDULE : RIDE_TYPE.KEY_NORMAL
                let driverId = '';

                if(result[0].driverId != ''){
                    driverId = result[0].driverId;
                }

                // let distanceInKm = parseInt(result[0].initiateDistance) / 1000;
                // let durationInMinute = parseInt(result[0].initiateDistance) / 60;

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
                    'serviceTypeId' : serviceTypeId,
                    'estimateDistance' : '',
                    'rideType' : rideType,
                    'initiatedAt' : result[0].created_at,
                    'nearestDriverIds' : [],
                    'driverId' : driverId,
                    'rideStatus' : [{
                        'rideStatus' : RIDE_STATUS.RIDE_INITIATED.id,
                        'statusMsg' : RIDE_STATUS.RIDE_INITIATED.msg,
                        'rideEta' : '',
                        'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss'),
                    }],
                    'fareDetails' : {
                        'distance' : result[0].initiateDistance,
                        'drivingDuration' : result[0].initialDuration,
                        'taxPercentage' : 18,
                        'discountPercentage' : 20,
                        'finalFare' : 0
                    }
                };
                let writeableDataCopy = writeableData;
                writeableData = JSON.stringify(writeableData);

                fs.writeFile(DIR_NAME +'/'+ rideId + '.' +rideFileExtension, writeableData, (err) => {
                    if(serviceId == SERVICE.SERVICE_EMERGENCY && driverId != ''){               
                        sendRideNavigation(writeableDataCopy, writeableDataCopy.driverId);
                    }else{
                        let getAllAvailableTypeDrivers = (serviceId == SERVICE.SERVICE_EMERGENCY) ? '': serviceTypeId ;

                        msg = 'driver searching process starting';
                        io.to(customerIdWithSocketId[customerId]).emit(SOCKET_THROUGH.SEND.DRIVER_SEARCHING, {'driverSearchStatus' : DRIVER_BOOKING_STATUS['neutral'], 'msg' : msg});

                        if(driverId === '' || driverId === null){ //except scan booking this if block will be executed
                            //now start driver searching according to customer origin lat and lng
                            let url =  `${baseUrlCustomer}nearByDrivers?all=${getAllAvailableTypeDrivers}`;
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
                                    },
                                    "serviceTypeId" : getAllAvailableTypeDrivers
                                }
                            })
                            .then(function (response) {
                                // console.log('nearby drivers');
                                // console.log(response);
                                let getNearestDriversData = (response.data.length === 0) ? [] : response.data.nearByDrivers;

                                fs.readFile(DIR_NAME +'/'+ rideId + '.' + rideFileExtension, 'utf-8', (err, data) => {
                                    data = JSON.parse(data);

                                    let nearByDriversIdArray = [];
                                    let nearByDriversTokenArray = [];

                                    // let nearestDriverData = {};
                                    for(let i = 0; i < getNearestDriversData.length; i++){
                                        // nearestDriverData = {
                                        //     'id' : getNearestDriversData[i].id,
                                        //     'token' : getNearestDriversData[i].token
                                        // }
                                        nearByDriversIdArray.push(getNearestDriversData[i].id);
                                        nearByDriversTokenArray.push(getNearestDriversData[i].token);
                                    }

                                    data.nearestDriverIds = nearByDriversIdArray;
                                    data.nearByDriversTokenArray = nearByDriversTokenArray;
                                    data = JSON.stringify(data);

                                    fs.writeFile(DIR_NAME +'/'+ rideId+ '.' +rideFileExtension, data, (err) => {
                                        if(getNearestDriversData.length === 0){
                                            msg = 'no driver found';
                                            // socket.emit('driverSearching', {'driverSearchStatus' : DRIVER_BOOKING_STATUS['not_found'], 'msg' : msg});
                                            io.to(customerIdWithSocketId[customerId]).emit(SOCKET_THROUGH.SEND.DRIVER_SEARCHING, {'driverSearchStatus' : DRIVER_BOOKING_STATUS['not_found'], 'msg' : msg});
                                        }else{
                                            sendRequestToDriver(rideId);
                                        }
                                    });

                                });
                            })
                            .catch(function (error) {
                                console.log(error);
                            });
                        }else if(driverId != ''){
                            sendRequestToDriver(rideId);
                        }
                    }
                    sendMainScreenData();
                });
            }
        });
    }

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
                if(fs.existsSync(DIR_NAME +'/'+ data.rideId + '.' + rideFileExtension)){
                    fs.readFile(DIR_NAME +'/'+ data.rideId + '.' + rideFileExtension, 'utf-8', (err, resData) => {
                        resData = JSON.parse(resData);

                        resData.waypoints = data.waypoints;
                        resData.destination = data.destination;

                        let driverId = resData.driverId;

                        // axios --start
                        let url =  `https://jaduridedev.v-xplore.com/customers/ride/${data.rideId}/fare`;
                        let getData = {
                            origin : resData.origin,
                            destination : data.destination,
                            waypoints : data.waypoints
                        };

                        axios({
                            method:'get',
                            url,
                            headers: {
                                'x-api-key' : APIKEY,
                                'platform' : 'web',
                                'deviceid' : '',
                            },
                            data: getData
                        })
                        .then( (response) => {
                            // console.log(response.data);
                            if(response.status){
                                let newFare = response.fare;
                                resData.rideDetails.fare = newFare;
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
                            }
                        })
                        .catch((response)=>{
                            // console.log(response);
                        });
                        // axios --end
                    });
                }
            }
        });
    });

    const sendRequestToDriver = (rideId) => {
        console.log('sendRequestToDriver');
        fs.readFile(DIR_NAME +'/'+ rideId+ '.' +rideFileExtension, 'utf-8', (err, data) => {
            data = JSON.parse(data);

            if(data.driverId === '' || data.driverId === null){//except scan booking
                let nearByDriversIdArray = data.nearestDriverIds;

                if(nearByDriversIdArray.length > 0){
                    let requestDriverData = {
                        'rideId' : data.rideId,
                        'vehicleType' : data.service_id,
                        'passTimer' : DRIVER_PASS_TIMER_IN_SEC,
                        'lat' : parseFloat(data.origin.lat),
                        'lng' : parseFloat(data.origin.lng),
                        'customerDetails' : data.customerDetails,
                        'alertSoundUrl' : (data.service_id != SERVICE.SERVICE_EMERGENCY) ? soundNormal : soundEmergency
                    };

                    console.log(nearByDriversIdArray);

                    let nearestDriversArraySocketIds = [];
                    for(let i = 0; i < nearByDriversIdArray.length; i++)
                        nearestDriversArraySocketIds.push(driverIdWithSocketId[nearByDriversIdArray[i]]);

                    console.log(nearestDriversArraySocketIds);
                    io.sockets.to(nearestDriversArraySocketIds).emit( SOCKET_THROUGH.SEND.RIDE_REQUEST, requestDriverData);

                    // Send notificaton to customer start
                    let title = 'Ride request';
                    let msg = 'New ride request ';
                    let image = jaduLogo;
                    let action = JSON.stringify({
                        "screen": "dashBoard",
                        "bookingDetails" : requestDriverData
                    });

                    let token = data.nearByDriversTokenArray[0];

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
            }else{ // booking using scan
                let requestDriverData = {
                    'rideId' : data.rideId,
                    'vehicleType' : data.service_id,
                    'passTimer' : DRIVER_PASS_TIMER_IN_SEC,
                    'lat' : parseFloat(data.origin.lat),
                    'lng' : parseFloat(data.origin.lng),
                    'customerDetails' : data.customerDetails
                };
                io.to(driverIdWithSocketId[data.driverId]).emit( SOCKET_THROUGH.SEND.RIDE_REQUEST, requestDriverData);
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

            fs.readFile(DIR_NAME +'/'+ r + '.' + rideFileExtension, 'utf-8', (err, resData) => {
                resData = JSON.parse(resData);

                let nearestDriversArray = resData.nearestDriverIds;

                let afterDriverAcceptenceDriverArray = deleteFromArray(nearestDriversArray, data.driverId);

                let nearestPassDriversArraySocketIds = [];
                if( nearestDriversArray.length == 1 ){ nearestPassDriversArraySocketIds.push('undefined') }

                for(let i = 0; i < afterDriverAcceptenceDriverArray.length; i++)
                    nearestPassDriversArraySocketIds.push(driverIdWithSocketId[afterDriverAcceptenceDriverArray[i]]);

                if(data.status == 'BOOKING_ACCEPT'){
                    // this emmition for those drivers whome not accepted ride request to close the ride request pop-up window
                    console.log('nearestPassDriversArraySocketIds');
                    console.log(nearestPassDriversArraySocketIds);

                    io.sockets.to(nearestPassDriversArraySocketIds).emit( SOCKET_THROUGH.SEND.AFTER_RIDE_ACCEPTED, {'status' : 'BOOKING_PASS', 'msg' : 'Someone was already accept this ride'});

                    resData.driverId = data.driverId;

                    setDriverData = {'rideId' : data.rideId, 'driverId' : data.driverId};

                    if(setDriverIdInRideDetails(setDriverData)){
                        console.log('#############---------------------------Driver found-----------------------################');
                        io.to(customerIdWithSocketId[resData.customerId]).emit(SOCKET_THROUGH.SEND.DRIVER_SEARCHING, {'driverSearchStatus' : DRIVER_BOOKING_STATUS['found'], 'msg' : 'Driver found'});

                        //Update ride fare for SERVICE_EMERGENCY using driver Id and rideID
                        if(resData.service_id == SERVICE.SERVICE_EMERGENCY){
                            updateRideFareOnEmergencyUsingDriverAndRideId(data.rideId, data.driverId);
                        }

                        getDriverDetails(data.driverId, data.rideId).then( (result) => {
                            console.log(result);
                            if( Array.isArray(result) && result.length > 0){
                                result = result[0];

                                let rideDetails = {
                                    'otp' : result.otp,
                                    'paymentMethod' : result.paymentMethod.replace(/\"/g, ''),
                                    'fare' : result.fare,
                                    'driverDetails' : {
                                        'name' : toTitleCase(result.name),
                                        'image' : (result.image === null || result.image.trim() === "") ? noDriverImage : baseUrl+result.image,
                                        'totalTrips' : result.totalTrips.toString(),
                                        'mobileNumber' : result.mobile,
                                        'carName' : toTitleCase(result.carName),
                                        'cabNumber' : result.vehicle_number,
                                        'rating' : result.rating,
                                        'qrCode' : baseUrl + result.qrCode,
                                        'wallet' : result.wallet,
                                        'token' : result.token
                                    },
                                    'driverExtraData' : {
                                        'totalKmPurchased' : result.totalKmPurchased,
                                        'totalTravelled' : result.totalTravelled,
                                        'totalRideTime' : result.totalRideTime
                                    }
                                };

                                // Send notificaton to customer start
                                let title = toTitleCase(result.name) + ' | ' + result.vehicle_number;
                                let msg = 'Driver found';
                                let image = baseUrl + result.image;
                                let action = 'click';

                                let token = resData.customerDetails.token;
                                if(token != null || token != 'null'){
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
                                    'rideEta' : '',
                                    'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss'),
                                };

                                resData.rideStatus.push(rideStatusData);

                                resData.rideDetails = rideDetails;

                                let rideNavigationData = {
                                    'customerName' : resData.customerDetails.name,
                                    'currentStage' : RIDE_STAGES_FRONTEND_DRIVER.PICKUP,
                                    'serviceId' : resData.service_id,
                                    'pickUpLocation': resData.origin,
                                    'skipOnRideEmission' : STATIC_SKIP.NO
                                };

                                console.log(rideStatusData);

                                io.to(customerIdWithSocketId[resData.customerId]).emit(SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);
                                io.to(customerIdWithSocketId[resData.customerId]).emit(SOCKET_THROUGH.SEND.ACCEPTED_DRIVER_DETAILS, rideDetails);

                                console.log(rideDetails);

                                resDataCopy = resData;
                                resData = JSON.stringify(resData);
                                fs.writeFile(DIR_NAME +'/'+ data.rideId+ '.' +rideFileExtension, resData ,(err) => {
                                    let rideCurrentDriver = [];
                                    rideCurrentDriver.push(driverIdWithSocketId[data.driverId]);

                                    if(resDataCopy.service_id == SERVICE.SERVICE_EMERGENCY){                                        
                                        let driverId = data.driverId;
                                        sendRideNavigation(resDataCopy, driverId);
                                    }else{
                                        io.sockets.to(rideCurrentDriver).emit(SOCKET_THROUGH.SEND.RIDE_NAVIGATION, rideNavigationData);
                                    }

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

    socket.on( SOCKET_THROUGH.RECEIVED.UPDATE_CURRENT_LOCATION, (data) =>{ //from driver
        // console.log('call driver live location');
        // data = {
        //     'rideId' : '',
        //     'currentLocation' : {
        //         'lat' : '',
        //         'lng' : ''
        //     },
        //     'driverId' : '',
        //     'customerId' : '',
        // }
        let location = {
            "lat": parseFloat(data.currentLocation.lat),
            "lng": parseFloat(data.currentLocation.lng)
        };
        // console.log(typeof data);
        // console.log(data.rideId);
        // fs.readFile(DIR_NAME +'/'+ data.rideId + '.' + rideFileExtension, 'utf-8', (err, resData) => {
        //     // console.log(resData);
        //     resData = JSON.parse(resData);
        //     let isPointsNear = arePointsNear(data.currentLocation, resData.destination, 1);
        //     console.log(`Are driver reached witthen 1KM from destination ? - ${isPointsNear}`);
        //     if(isPointsNear){
        //         const now = new Date(); //get cuttent date time
        //         let rideStatusData = {
        //             'rideStatus' : RIDE_STATUS.RIDE_REACHED_ONE_KM_FROM_DESTINATION.id,
        //             'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss'),
        //         };
        //         resData.rideStatus.push(rideStatusData);
        //         resData = JSON.stringify(resData);
        //         fs.writeFile(DIR_NAME +'/'+ data.rideId + '.' + rideFileExtension, resData ,(err) => {
        //             updateDriverCurrentStatus(driverId, 'DRIVER_WAITING').then((result) => {});
        //         });
        //     }
        // });
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
                                    sendMainScreenData();
                                }
                            });
                        });
                    });
                });
            });
        }else{
            cancelRide(rideId, "", 'normal').then((result) => {
                console.log('ride cancel trigger before any driver accept');
                sendMainScreenData();
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

                io.to(customerIdWithSocketId[resData.customerId]).emit( SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);   // emit to c
                io.to(driverIdWithSocketId[resData.driverId]).emit( SOCKET_THROUGH.SEND.CLIENT_LOCATED, clientLocatedData );  // emit to d
            }else if(type === 'KEY_END_TRIP'){

                //update ride total timings in minutes

                rideStatusData = {
                    'rideStatus' : RIDE_STATUS.RIDE_ON_INITIATE_PAYMENT.id,
                    'statusMsg' : RIDE_STATUS.RIDE_ON_INITIATE_PAYMENT.msg,
                    'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss')
                };
                io.to(customerIdWithSocketId[resData.customerId]).emit( SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);   // emit to c
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
                            updateDriverCurrentStatus(rideId, driverId, 'DRIVER_WAITING', 'initiatePayment').then((result) => {
                                console.log((result) ? 'Driver released from ride... now driver allowed to get ride' : 'Some error occoured to release driver from ride');
                                fs.readFile(newFileNameWithPath, 'utf-8', (err, resData) => {
                                    resData = JSON.parse(resData);

                                    paymentLogicInitiated(resData, driverId);
                                });
                            });
                        });
                    });
                }
            }
        });
    });

    const paymentLogicInitiated = (resData, driverId) => {        
        if(resData.service_id == SERVICE.SERVICE_EMERGENCY){
            let totalFare = parseInt(resData.rideDetails.fare) * 2;
            console.log(totalFare);
            io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.TOTAL_RIDE_FARE_EMERGENCY, totalFare);
        }else{
            let rideFareData = {
                'totalFare' : resData.rideDetails.fare,
                'qRCode' : resData.rideDetails.driverDetails.qrCode
            };
            console.log(rideFareData);
            io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.TOTAL_RIDE_FARE, rideFareData);
            io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.PAYMENT_ACCEPTANCE_CONTROL, false);
        }
    }

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

                io.sockets.to([customerIdWithSocketId[resData.customerId]]).emit( SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);   // emit to c

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
            io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.IS_OTP_VERIFIED, checkOtpResponse);
            // io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.IS_OTP_VERIFIED, checkOtpResponse);

            if(rideOriginalOtp === otp){
                resData.destination.lat = parseFloat(resData.destination.lat);
                resData.destination.lng = parseFloat(resData.destination.lng);

                let dropNavigationData = {
                    'waypoints' :resData.waypoints,
                    'destination' : resData.destination
                };
                console.log(dropNavigationData);
                sendDriverRideDropNavigation(dropNavigationData, driverId);
            }

            resData = JSON.stringify(resData);
            fs.writeFile(DIR_NAME +'/'+ rideId + '.' + rideFileExtension, resData ,(err) => {});
        });
    });

    const sendRideNavigation = (resData, driverId) => {
        console.log('sendRideNavigation');

        console.log('Customer Name : ' + resData.customerDetails.name);

        console.log('Driver Id : ' + driverId);

        let rideNavigationData = {
            'customerName' : resData.customerDetails.name,
            'currentStage' : RIDE_STAGES_FRONTEND_DRIVER.ONGOING,
            'serviceId' : resData.service_id,
            'pickUpLocation': resData.origin,
            // 'skipOnRideEmission' : STATIC_SKIP.NO
        };
        io.to(driverIdWithSocketId[driverId]).emit(SOCKET_THROUGH.SEND.RIDE_NAVIGATION, rideNavigationData);        
    }

    const updateAfterRideDriverKms = (driverId, rideTimeInSec, rideDistanceInMeter) => {
        console.log('updateAfterRideDriverKms');
        let url =  `${baseUrl}driver/updateAfterRideDetails?driverId=${driverId}&rideTimeInSec=${rideTimeInSec}&rideDistanceInMeter=${rideDistanceInMeter}`;
        
        axios({
            method:'get',
            url,    
            headers: {
                'x-api-key' : APIKEY,
                'platform' : 'web',
                'deviceid' : '',
            }
        })
        .then( (response) => { console.log(response); })
        .catch((response)=>{
            console.log('error');
        });
    }

    socket.on( SOCKET_THROUGH.RECEIVED.ON_RIDE_NAVIGATION_CREATE, (rideId) => {
        console.log('ON_RIDE_NAVIGATION_CREATE');

        fs.readFile(DIR_NAME +'/'+ rideId + '.' + rideFileExtension, 'utf-8', (err, resData) => {
            console.log(rideId);
            resData = JSON.parse(resData);
            resData.destination.lat = parseFloat(resData.destination.lat);
            resData.destination.lng = parseFloat(resData.destination.lng);

            let dropNavigationData = { 
                'waypoints' :resData.waypoints,
                'destination' : resData.destination
            };
            sendDriverRideDropNavigation(dropNavigationData, resData.driverId);
        });
    });

    socket.on( SOCKET_THROUGH.RECEIVED.DRIVER_ON_CLIENT_LOCATED_CREATED, (driverId) => {
        console.log('DRIVER_ON_CLIENT_LOCATED_CREATED');
        let clientLocatedData = {
            "rideStage" : RIDE_STAGES_FRONTEND_DRIVER.WAITING,
            "waitingTime": {
                "min": CUSTOMER_PERMISSABLE_WAITING_TIME.min,
                "second": CUSTOMER_PERMISSABLE_WAITING_TIME.sec
            }
        };

        io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.CLIENT_LOCATED, clientLocatedData);
    });

    const sendDriverRideDropNavigation = (dropNavigationData, driverId) => {
        console.log('sendDriverRideDropNavigation');
        io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.RIDE_DROP_NAVIGATION, dropNavigationData);
    }

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
            if(data.selectedMethod == PERMISSABLE_PAYMENT_METHOD.METHOD_CASH || data.selectedMethod == PERMISSABLE_PAYMENT_METHOD.METHOD_WALLET || data.selectedMethod == PERMISSABLE_PAYMENT_METHOD.METHOD_PAYLATER){
                
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

                    // axios --start
                    let url =  `https://jaduridedev.v-xplore.com/customers/rideTransactionThroughCash`;
                    let postData = {
                        rideId : data.rideId,
                        customerId : resData.customerId,
                        driverId : resData.driverId,
                        amount : data.amount,
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
                        resData = JSON.parse(resData);

                        io.to(customerIdWithSocketId[resData.customerId]).emit(SOCKET_THROUGH.SEND.PAYMENT_STATUS, paymentStatusData);
                        io.to(driverIdWithSocketId[resData.driverId]).emit( SOCKET_THROUGH.SEND.PAYMENT_ACCEPTANCE_CONTROL, true);
                    })
                    .catch((response)=>{
                        console.log('error');
                    });
                    // axios --end
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
                }else if(data.selectedMethod == PERMISSABLE_PAYMENT_METHOD.METHOD_PAYLATER){
                    paymentStatusData = {
                        'status' : PAYMENT_STATUS.LOADING,
                        'message' : 'thank you for using paylater option'
                    }

                    // axios --start
                    let url =  `https://jaduridedev.v-xplore.com/customers/rideTransactionThroughPaylater`;
                    let postData = {
                        rideId : data.rideId,
                        customerId : resData.customerId,
                        driverId : resData.driverId,
                        amount : data.amount,
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
                        resData = JSON.parse(resData);

                        io.to(customerIdWithSocketId[resData.customerId]).emit(SOCKET_THROUGH.SEND.PAYMENT_STATUS, paymentStatusData);
                        io.to(driverIdWithSocketId[resData.driverId]).emit( SOCKET_THROUGH.SEND.PAYMENT_ACCEPTANCE_CONTROL, true);
                    })
                    .catch((response)=>{
                        console.log('error');
                    });
                    // axios --end
                }
            }
            
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

                if(resData.rideDetails.paymentMethod == PERMISSABLE_PAYMENT_METHOD.METHOD_CASH){
                    // axios --start
                    let url =  `https://jaduridedev.v-xplore.com/customers/updateRideTransactionThroughCash`;
                    let postData = {
                        rideId : rideId,
                        customerId : resData.customerId,
                        driverId : resData.driverId,
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
                        // console.log('success');
                        // console.log(response);
                    })
                    .catch((response)=>{
                    //    console.log('error');
                    //    console.log(response);
                    });
                    // axios --end
                }

                let rideStatusData = {
                    'rideStatus' : RIDE_STATUS.RIDE_COMPLETED.id,
                    'statusMsg' : RIDE_STATUS.RIDE_COMPLETED.msg,
                    'dateTime' : date.format(now, 'YYYY-MM-DD HH:mm:ss')
                };

                updateDriverCurrentStatus(rideId, driverId, 'DRIVER_WAITING', 'completed').then((result) => {});
                resData.rideStatus.push(rideStatusData);

                sendRideControlEvent(customerId);

                // ----------------------------------------------------------------
                
                let rideStatus = resData.rideStatus;

                let rideInitiateTime = '';
                let rideCompleteTime = '';

                rideStatus.forEach((ride_status) => {
                    if(ride_status.rideStatus== RIDE_STATUS.RIDE_INITIATED.id){
                        rideInitiateTime = ride_status.dateTime;
                    }
                    if(ride_status.rideStatus== RIDE_STATUS.RIDE_COMPLETED.id){
                        rideCompleteTime = ride_status.dateTime;
                    }
                });

                rideInitiateTime = new Date(rideInitiateTime);
                rideCompleteTime = new Date(rideCompleteTime);

                let rideCompletionTimeInMiliSec = rideCompleteTime - rideInitiateTime;
                let rideCompletionTimeInSec = parseInt(rideCompletionTimeInMiliSec) / 1000;

                let rideDistanceInMeter = resData.fareDetails.distance;

                updateAfterRideDriverKms(driverId, rideCompletionTimeInSec, rideDistanceInMeter);
                
                // ----------------------------------------------------------------

                resData = JSON.stringify(resData);
                fs.writeFile(DIR_NAME + '/'  + DIR_COMPLETED_FOLDER + '/' + rideId+ '.' + rideFileExtension, resData ,(err) => {
                    console.log('Payment successful');

                    io.to(customerIdWithSocketId[customerId]).emit(SOCKET_THROUGH.SEND.PAYMENT_STATUS, {
                        'status' : PAYMENT_STATUS.SUCCESS,
                        'message' : `Payment of ??? ${fare} to ${driverName} Successfull`
                    });

                    io.to(customerIdWithSocketId[customerId]).emit(SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);

                    io.to(driverIdWithSocketId[driverId]).emit( SOCKET_THROUGH.SEND.AFTER_PAYMENT, true);

                    sendMainScreenData();
                });
            }
        });        
    }

    const sendRideControlEvent = (customerId) => {
        io.to(customerIdWithSocketId[customerId]).emit(SOCKET_THROUGH.SEND.CUSTOMER_CONTROL_RIDE_ENRTY);
    }

    socket.on(SOCKET_THROUGH.RECEIVED.DISCONNECTING, () => {
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

        let mainScreenData = {
            'connectedDrivers' : Object.keys(driverIdWithSocketId).length,
            'connectedCustomers' :  Object.keys(customerIdWithSocketId).length
        };
        io.to(mainScreen['MAIN_SCREEN_1234']).emit(SOCKET_THROUGH.SEND.MAIN_SCREEN_DATA, mainScreenData);
    });

    socket.on(SOCKET_THROUGH.RECEIVED.GET_ONGOING_RIDE_DETAILS, (rideId) => {
        console.log('getOngoingRideDetails');
        let fileLocation = DIR_NAME +'/'+ rideId + '.' + rideFileExtension;
        let completedFileLocation =  DIR_NAME + '/'  + DIR_COMPLETED_FOLDER + '/' + rideId + '.' + rideFileExtension;

        let getOriginalFileLocation = (fs.existsSync(fileLocation)) ? fileLocation : (fs.existsSync(completedFileLocation)) ? completedFileLocation : '';

        if(fs.existsSync(getOriginalFileLocation)){
            fs.readFile(getOriginalFileLocation, 'utf-8', (err, resData) => {
                resData = JSON.parse(resData);

                result = resData.rideDetails;
                let driverDetails = resData.rideDetails.driverDetails
                let rideDetails = {
                    'otp' : result.otp,
                    'paymentMethod' : result.paymentMethod.replace(/\"/g, ''),
                    'fare' : result.fare,
                    'driverDetails' : driverDetails
                };
                let rideStatus = resData.rideStatus;
                let rideStatusData = rideStatus[rideStatus.length - 1];
                
                if(rideStatusData.rideStatus == RIDE_STATUS.RIDE_ARRIVED.id){                    
                    rideStatusData.rideStatus = RIDE_STATUS.RIDE_ARRIVING.id
                }

                io.to(customerIdWithSocketId[resData.customerId]).emit( SOCKET_THROUGH.SEND.ACCEPTED_DRIVER_DETAILS, rideDetails);
                io.to(customerIdWithSocketId[resData.customerId]).emit( SOCKET_THROUGH.SEND.RIDE_STATUS, rideStatusData);
            });
        }
    });

    const updateRideFareOnEmergencyUsingDriverAndRideId = (rideId, driverId) => {       
        let url =  `${baseUrlCustomer}update/emergency/ride/fare?rideId=${rideId}&driverId=${driverId}`;
        // let postData = {
        //     rideId : rideId,
        //     driverId : driverId
        // };

        axios({
            method : 'get',
            url,
            headers : {
                'x-api-key' : APIKEY,
                'platform' : 'web',
                'deviceid' : ''
            }
        })
        .then(function (response) {      
            let fare = (response.data.length === 0) ? 0 : response.data.fare;
            let service_id = (response.data.length === 0) ? 0 : response.data.serviceId;

            fs.readFile(DIR_NAME +'/'+ rideId + '.' + rideFileExtension, 'utf-8', (err, data) => {
                data = JSON.parse(data);
                data.rideDetails.fare = fare;
                // data.service_id = service_id;
                
                data = JSON.stringify(data);
                fs.writeFile(DIR_NAME +'/'+ rideId+ '.' +rideFileExtension, data, (err) => {});
            });
        })
        .catch(function (error) {
            console.log(error);
        });
    }    
}); 

http.listen(port, function(){
   console.log(`listening on localhost:${port}`);
});