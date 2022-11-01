const mysql = require('mysql2');

const connectionPool = mysql.createPool({
    host: '35.213.182.208',
    user: 'ut9bbcxgkh6oj',
    password: 'x3af4xyca8pm',
    database: 'db6t8mtztkupxg'
});

// connectionPool.getConnection((err)=>{
//     // if(err) throw err;
//     console.log(err);
// });

const getDriverDetails = (driverId, rideId) => {
    // console.log('getDriverDetails - called--------------------------------------------------------------------------------------START');
    return new Promise((resolve, reject) => {
        let query = `SELECT u.name, u.profile_image as image, d.vehicle_number, d.rating, d.wallet_value as wallet, r.otp, r.paymentMethod, r.fare, d.qr_code as qrCode, n.token
        FROM \`driver\` as d JOIN \`users\` as u ON u.uid = d.user_id 
        JOIN \`ride_normal\` AS r ON r.driver_id = d.uid
        LEFT JOIN \`device_notification_data_firebase\` as n ON r.driver_id = n.specific_level_user_id
        WHERE d.uid = '${driverId}'
        AND  r.uid = '${rideId}'`;

        // console.log(query);
        
        connectionPool.query(
            query,
            (err, results) => {
                // console.log('Error : -- ');
                // console.log(err);

                // console.log(results);
                // console.log('getDriverDetails - called--------------------------------------------------------------------------------------END');
                return (results.length === 0) ? resolve([]) : resolve(results);
            }
        );
    });
}

function getRideDetails(rideID){    
    let query = `SELECT r.customer_id as customerId, r.origin, r.destination, r.waypoints, r.service_id, r.created_at, u.name, u.profile_image as image, c.wallet_value as wallet, c.rating, n.token 
    FROM \`ride_normal\` as r  
    JOIN \`customer_new\` as c ON r.customer_id = c.uid
    JOIN \`users\` as u ON c.user_id = u.uid
    LEFT JOIN \`device_notification_data_firebase\` as n ON r.customer_id = n.specific_level_user_id
    WHERE r.uid = '${rideID}'`;
    // console.log(query);
    return new Promise((resolve, reject) => {
        connectionPool.query(
            query,
            (error, results) => {
                console.log(error);
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
                console.log(error);
                console.log(results);                
                return (results.affectedRows === 1) ? resolve(true) : resolve(false);
            }
        );
    });
}

function setDriverIdInRideDetails(data){   
    return new Promise((resolve, reject) => {
        connectionPool.query(
            `UPDATE 
                \`ride_normal\`, \`driver\` 
            SET 
                \`ride_normal\`.\`driver_id\` = '${data.driverId}',
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
        connectionPool.query(
            `UPDATE 
                \`ride_normal\`, \`driver\` 
            SET 
                \`ride_normal\`.\`ride_status\` = '${rideStatus}',
                \`driver\`.\`working_status_current_value\` = '${driverStatusWaiting}'
            WHERE 
                \`ride_normal\`.\`uid\` = '${rideId}'
                AND \`driver\`.\`uid\` = '${driverId}'`,
            (error, results) => {                
                return (results.affectedRows === 2) ? resolve(true) : resolve(false);
            }
        );
    });
}

const updateDriverCurrentStatus = (driverId, driverStatusWaiting) => {
    return new Promise( (resolve, reject) => {
        connectionPool.query(
            `UPDATE
                \`driver\` as d
            SET
                d.\`working_status_current_value\` = '${driverStatusWaiting}'
            WHERE                 
                d.\`uid\` = '${driverId}'`,
            (error, results) => {
                return resolve((results.affectedRows === 1) ? true : false);
            }         
        );
    });
}

module.exports = {getDriverDetails, getRideDetails, updateRidePath, setDriverIdInRideDetails, cancelRide, updateDriverCurrentStatus }