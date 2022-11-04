const admin = require("firebase-admin");

const serviceAccount = require("./service-account.json");
const serviceAccountDriver = require("./service-account-driver.json");
const { APP } = require("./defaultValues");

let SERVICE_ACCOUNT = serviceAccount;

const sendNotification = (token, title, body, imageUrl, extraData, APP_NAME = APP.APP_CUSTOMER) => {
    if(APP_NAME == APP.APP_DRIVER){
        SERVICE_ACCOUNT = serviceAccountDriver;
    }

    admin.initializeApp({
        credential: admin.credential.cert(SERVICE_ACCOUNT),
    });

    const message = {
        notification: {
            title: title,
            body: body,
            image : imageUrl,
        },
        data: extraData,
        token: token
    };    

    admin.messaging().send(message)
        .then((response) => {
            console.log('Successfully sent message: ');
            console.log(response);
        })
       .catch((error) => {
           console.log('Error sending message:', error);
    });
}

module.exports = {sendNotification};