const admin = require("firebase-admin");

var serviceAccount = require("./service-account-driver.json");

admin.initializeApp({
  	credential: admin.credential.cert(serviceAccount),
});

const sendNotification = (token, title, body, imageUrl, extraData) => {
    const message = {
        notification: {
            title: title,
            body: body,
            image : imageUrl,
        },
        data: extraData,
        token: token
    };
    if(typeof token === 'string'){
        admin.messaging().send(message)
            .then((response) => {
                console.log('Successfully sent message: ');
                console.log(response);
            })
        .catch((error) => {
            console.log('Error sending message:', error);
        });
    }else{
        admin.messaging().sendMulticast(message)
            .then((response) => {
                console.log('Successfully sent message: ');
            })
        .catch((error) => {
            console.log('Error sending message:', error);
        });
    }
}

module.exports = {sendNotification};