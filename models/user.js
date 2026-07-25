const mongoose = require('mongoose');
mongoose.set('strictQuery', true); // or false, depending on your preference
const Schema = mongoose.Schema;
const passportLocalMongoose=require("passport-local-mongoose");
const userSchema = new Schema({
  email: {
    type: String,
    required: true
  }
});

userSchema.plugin(passportLocalMongoose, {
  usernameQueryFields: ['email']
});

module.exports = mongoose.model("User", userSchema);

