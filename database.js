const mysql = require('mysql2');
const date = require('date-and-time');

const connectionPool = mysql.createPool({
    host: '35.213.182.208',
    user: 'ut9bbcxgkh6oj',
    password: 'x3af4xyca8pm',
    database: 'db6t8mtztkupxg'
});

const getDriverDetails = (driverId, rideId) => {
    return new Promise((resolve, reject) => {
        let query = `SELECT u.name, u.profile_image as image, d.vehicle_number, d.rating, d.wallet_value as wallet, r.otp, r.paymentMethod, r.fare, d.qr_code as qrCode, n.token
        FROM \`driver\` as d JOIN \`users\` as u ON u.uid = d.user_id 
        JOIN \`ride_normal\` AS r ON r.driver_id = d.uid
        LEFT JOIN \`device_notification_data_firebase\` as n ON r.driver_id = n.specific_level_user_id
        WHERE d.uid = '${driverId}'
        AND  r.uid = '${rideId}'`;
        
        connectionPool.query(
            query,
            (err, results) => {
                return (results.length === 0) ? resolve([]) : resolve(results);
            }
        );
    });
}

const getRideDetails = (rideID) => {
    let query = `SELECT r.customer_id as customerId, r.origin, r.destination, r.waypoints, r.service_id, r.fareServiceTypeId serviceTypeId, r.created_at, r.driver_id driverId, u.name, u.profile_image as image, c.wallet_value as wallet, c.rating, n.token, r.rideType 
    FROM \`ride_normal\` as r  
    JOIN \`customer_new\` as c ON r.customer_id = c.uid
    JOIN \`users\` as u ON c.user_id = u.uid
    LEFT JOIN \`device_notification_data_firebase\` as n ON r.customer_id = n.specific_level_user_id
    WHERE r.uid = '${rideID}'`;
    return new Promise((resolve, reject) => {
        connectionPool.query(
            query,
            (error, results) => {
                return (typeof results == 'undefined') ? resolve([]) : resolve(results);
            }
        );
    });
};

const updateRidePath = (rideId, waypoints, destination) => {
    waypoints = JSON.stringify(waypoints);
    destination = JSON.stringify(destination);

    return new Promise((resolve, reject) => {
        connectionPool.query(
            `UPDATE 
                \`ride_normal\` 
            SET 
                \`ride_normal\`.\`waypoints\` = '${waypoints}',
                \`ride_normal\`.\`destination\` = '${destination}' 
            WHERE
                \`ride_normal\`.\`uid\` = '${rideId}'`,
            (error, results) => {              
                return (results.affectedRows === 1) ? resolve(true) : resolve(false);
            }
        );
    });
}

const setDriverIdInRideDetails = (data) => {
    return new Promise((resolve, reject) => {
        connectionPool.query(
            `UPDATE 
                \`ride_normal\`, \`driver\` 
            SET 
                \`ride_normal\`.\`driver_id\` = '${data.driverId}',
                \`ride_normal\`.\`ride_status\` = 'started',
                \`driver\`.\`working_status_current_value\` = 'DRIVER_ON_TRIP'
            WHERE
                \`driver\`.\`uid\` = '${data.driverId}'
                AND \`ride_normal\`.\`uid\` = '${data.rideId}'`,
            (error, results) => {                
                return (results.affectedRows === 1) ? resolve(true) : resolve(false);
            }
        );
    });
};

const cancelRide = (rideId, driverId, rideType = 'normal') => {
    let tableName = '';
    let rideStatus = 'cancelled';

    let driverStatusWaiting = 'DRIVER_WAITING';
    
    if(rideType === 'normal') tableName = 'ride_normal';
    else if(rideType == 'schedule') tableName = 'ride_schedule';

    return new Promise( (resolve, reject) => {
        let sql =  (driverId != "") 
                ?
                    `UPDATE 
                        \`ride_normal\`, \`driver\` 
                    SET 
                        \`ride_normal\`.\`ride_status\` = '${rideStatus}',
                        \`driver\`.\`working_status_current_value\` = '${driverStatusWaiting}'
                    WHERE 
                        \`ride_normal\`.\`uid\` = '${rideId}'
                        AND \`driver\`.\`uid\` = '${driverId}'`
                :
                    `UPDATE 
                        \`ride_normal\`
                    SET 
                        \`ride_normal\`.\`ride_status\` = '${rideStatus}'                        
                    WHERE 
                        \`ride_normal\`.\`uid\` = '${rideId}'`;

        connectionPool.query(
           sql,
            (error, results) => {                
                return (results.affectedRows === 2) ? resolve(true) : resolve(false);
            }
        );
    });
}

const updateDriverCurrentStatus = (rideId, driverId, driverStatusWaiting, currentRideStatus = '') => {
    let sql = (currentRideStatus  == '') 
        ?
            `UPDATE
                \`driver\` as d
            SET
                d.\`working_status_current_value\` = '${driverStatusWaiting}'
            WHERE                 
                d.\`uid\` = '${driverId}'`
        :
            `UPDATE
                \`ride_normal\` as r, \`driver\` as d
            SET
                r.\`ride_status\` = '${currentRideStatus}',
                d.\`working_status_current_value\` = '${driverStatusWaiting}'
            WHERE 
                r.\`uid\` = '${rideId}' AND
                r.\`driver_id\` = '${driverId}' AND                
                d.\`uid\` = '${driverId}'`;
    
    return new Promise( (resolve, reject) => {
        connectionPool.query(
            sql,
            (error, results) => {
                return resolve((results.affectedRows > 0) ? true : false);
            }         
        );
    });
}

var add_minutes = (dt, minutes) => { return new Date(dt.getTime() + minutes*60000); }

const getScheduleRideData = () => {
    var d = new Date();
    let n1 = d.toLocaleString("en-US", {timeZone: "Asia/Kolkata", hour12: false }).replace(/\//g,'-');
    let currentDateTime = n1.split(',').join(' ');

    const now = new Date(currentDateTime);
    currentDateTime = date.format(now, 'YYYY-MM-DD HH:mm:ss');

    let dateTimeAfter30Mins = add_minutes(d, 30).toLocaleString("en-US", {timeZone: "Asia/Kolkata", hour12: false }).replace(/\//g,'-');
    dateTimeAfter30Mins = dateTimeAfter30Mins.split(',').join(' ');

    now30Plus = new Date(dateTimeAfter30Mins);
    dateTimeAfter30Mins = date.format(now30Plus, 'YYYY-MM-DD HH:mm:ss');

    return new Promise( (resolve, reject) => {
        let sql = `SELECT uid, schedule_date_time 
        FROM ride_normal 
        WHERE schedule_date_time between "${currentDateTime}" and "${dateTimeAfter30Mins}" AND ride_status = "processing" AND rideType = "ride_schedule" ORDER BY created_at DESC limit 1`;
        
        connectionPool.query(
            sql,
            (error, results) => {
                // return resolve((results.length != 0) ? results : []);
                return resolve(results);
            }
        );
    });
}

module.exports = {
    getDriverDetails, 
    getRideDetails, 
    updateRidePath, 
    setDriverIdInRideDetails, 
    cancelRide, 
    updateDriverCurrentStatus, 
    getScheduleRideData 
}