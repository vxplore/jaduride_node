const admin = require("firebase-admin");

var serviceAccount = require("./service-account.json");

admin.initializeApp({
  	credential: admin.credential.cert(serviceAccount),
})

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