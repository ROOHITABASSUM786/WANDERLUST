if(process.env.NODE_ENV!="production"){
    require('dotenv').config()
}
const express = require("express");
const app = express();
const mongoose = require("mongoose");
mongoose.set('strictQuery', false); 
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const ExpressError = require("./utils/ExpressError.js")
app.use(express.static(path.join(__dirname, "/public")))
const listingsRouter=require("./routes/listing.js");
const reviewsRouter=require("./routes/review.js")
const userRouter=require("./routes/user.js")
const session =require("express-session")
const MongoStore = require('connect-mongo').default;
const flash=require("connect-flash");
const passport=require("passport");
const localStrategy=require("passport-local");
const User=require("./models/user.js");
const dbUrl=process.env.ATLASDB_URL;
const dns=require("dns");
dns.setServers(["1.1.1.1","8.8.8.8"])
main().then(() => {
    console.log("connected to DB")
}).catch((err) => {
    console.log("not connected to DB",err)
})
async function main() {
    await mongoose.connect(dbUrl)
}
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);

const store=MongoStore.create({
    mongoUrl:dbUrl,
    crypto:{
        secret:process.env.SECRET
    },
    touchAfter:24*3600,
})
store.on("error",()=>{
    console.log("Error in mongo session store",err)
})
const sessionOptions={
    store,
    secret:process.env.SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        expires:Date.now()+7*24*60*60*1000,
        maxAge:7*24*60*60*1000,
        httpOnly:true,
    },
};

app.use(session(sessionOptions));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
app.use((req,res,next)=>{
    res.locals.success=req.flash("success");
    res.locals.error=req.flash("error");
    res.locals.currUser=req.user;
    console.log(res.locals.success)
    next();
})

app.use("/listings",listingsRouter);
app.use("/listings/:id/reviews",reviewsRouter)
app.get("/", (req, res) => {
    res.redirect("/listings");
});
app.use("/",userRouter)
app.use((req, res, next) => {
    next(new ExpressError(404, "page not found!"))
})
app.use((err, req, res, next) => {
    let { status = 500, message = "something went wrong" } = err;
    res.status(status).render("listings/error.ejs", { message })
    //    res.status(status).send(message);

})

app.listen(8080, () => {
    console.log("app is listening at port 8080");
})

