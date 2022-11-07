const admin = require("firebase-admin");

var serviceAccount = require("./service-account.json");
var serviceAccountDriver = require("./service-account-driver.json");

var _driver =  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountDriver),
});

var _customer =  admin.initializeApp({
  	credential: admin.credential.cert(serviceAccount),
},'jadu-ride-customer');

module.exports = {_customer, _driver};