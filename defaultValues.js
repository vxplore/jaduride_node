const CONNECTION_KEYS = {
    'connected' : 'STATUS_CONNECTED',
    'reconnect' : 'STATUS_RECONNECTED',
    'disconnect' : 'STATUS_DISCONNECTED'
}

const APP = {
    APP_CUSTOMER : 'CUSTOMER',
    APP_DRIVER : 'DRIVER'
}

const DRIVER_BOOKING_STATUS = {
    'neutral' : 'NEUTRAL',
    'found' : 'FOUND',
    'not_found' : 'NOT_FOUND'
}

const RIDE_STATUS = {
    RIDE_INITIATED : {
        'id' : "RIDE_INITIATED",
        'msg' : "Ride is initiated"
    },
    RIDE_ARRIVING : {
        'id' : "RIDE_ARRIVING",
        'msg' : "Ride is arriving in"
    },
    RIDE_CANCELLED : {
        'id' : "RIDE_CANCELLED",
        'msg' : "This ride is cancelled by customer"
    },
    RIDE_ARRIVED : {
        'id' : "RIDE_ARRIVED",
        'msg' : "Ride is arrived"
    },
    RIDE_WAITING : {
        'id' : "RIDE_WAITING",
        'msg' : "driver is waiting"
    },
    RIDE_STARTED : {
        'id' : "RIDE_STARTED",
        'msg' : "ride is started"
    },
    RIDE_ON_GOING : {
        'id' : "RIDE_ONGOING",
        'msg' : "ride is on going"
    },
    RIDE_REACHED_ONE_KM_FROM_DESTINATION : {
        'id' : "RIDE_REACHED_ONE_KM_FROM_DESTINATION",
        'msg' : "ride is reached one km from destination"
    },
    RIDE_COMPLETED : {
        'id' : "RIDE_COMPLETED",
        'msg' : "ride is completed"
    },
};

const RIDE_TYPE = {
    'KEY_NORMAL' : 'KEY_NORMAL',
    'KEY_SCHEDULE' : 'KEY_SCHEDULE'
}

const RIDE_STAGES_FRONTEND_DRIVER = {
    'PICKUP' : 'STAGE_PICKUP',
    'WAITING' : 'STAGE_WAITING',    //EXTRA CHAGES WILL BE APPLIED AS 'WAITING CHARGES' --- PENDING
    'ONGOING' : 'STAGE_ONGOING',
    'COMPLETED' : 'STAGE_COMPLETED',
};

const CUSTOMER_PERMISSABLE_WAITING_TIME = {
    'min' : 5,
    'sec' : 0,
}

const DRIVER_PASS_TIMER_IN_SEC = 300; 

const SOCKET_THROUGH = {
    RECEIVED : {
        AFTER_CONNECTION : 'afterConnection',
        INITIALISE_RIDE : 'initialiseRide',
        TRIGGERRIDE_RESPONSE : 'triggerRideResponse',
        UPDATE_RIDE_LOCATION : 'updateRideLocation',
        UPDATECURRENT_LOCATION : 'updateCurrentLocation',
        CANCEL_RIDE : 'cancelRide',
        ONRIDE : 'onRide',
        VERIFY_OTP : 'verifyOtp',
        INITIATE_RIDE_PAYMENT : 'initiateRidePayment',
        COMPLETE_RIDE_PAYMENT : 'completeRidePayment',
        DISCONNECTING : 'disconnecting'
    },
    SEND : {
        CONNECTION_STATUS : 'connectionStatus',
        DRIVER_SEARCHING : 'driverSearching',
        RIDE_REQUEST : 'rideReq',
        AFTER_RIDE_ACCEPTED : 'afterRideAccepted',
        RIDE_STATUS : 'rideStatus',
        ACCEPTED_DRIVER_DETAILS : 'acceptedDriverDetails',
        RIDE_NAVIGATION : 'rideNavigation',
        RIDE_CANCELLED : 'rideCancelled',
        CLIENT_LOCATED : 'clientLocated',
        IS_OTP_VERIFIED : 'isOtpVerified',
        RIDE_DROP_NAVIGATION : 'rideDropNavigation',
        PAYMENT_STATUS : 'paymentStatus',
        TOTAL_RIDE_FARE : 'totalRideFare',
        PAYMENT_ACCEPTANCE_CONTROL : 'paymentAcceptanceControl',
        AFTER_PAYMENT : 'afterPayment',
     }
}

const PERMISSABLE_PAYMENT_METHOD = {
    METHOD_CASH : 'METHOD_CASH',
    METHOD_WALLET : 'METHOD_WALLET',
    METHOD_UPI : 'METHOD_UPI'
}

const PAYMENT_STATUS = {
    LOADING : 'LOADING',
    SUCCESS : 'SUCCESS',
    FAILURE : 'FAILURE',
    NONE : 'NONE'
}

module.exports = {
    SOCKET_THROUGH, 
    CONNECTION_KEYS, 
    DRIVER_BOOKING_STATUS, 
    RIDE_STATUS, 
    RIDE_TYPE, 
    RIDE_STAGES_FRONTEND_DRIVER, 
    CUSTOMER_PERMISSABLE_WAITING_TIME, 
    DRIVER_PASS_TIMER_IN_SEC, 
    PERMISSABLE_PAYMENT_METHOD,
    PAYMENT_STATUS,
    APP
};