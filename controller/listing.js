const Listing=require("../models/listing")

const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');
const mapToken=process.env.MAP_TOKEN;
const geocodingClient = mbxGeocoding({ accessToken: mapToken});
const axios = require("axios");
module.exports.index = async (req, res) =>
     { const { category } = req.query;
 let filter = {}; 
 if (category) { 
    filter.category = category; } 
 const allListings = await Listing.find(filter); 
 res.render("listings/index.ejs", { allListings, category }); };

module.exports.renderNewForm= (req, res) => {
    res.render("listings/new.ejs");

}
module.exports.showListingDetails=async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id).populate({ path: "reviews", populate: { path: "author" }, }).populate("owner")
    if (!listing) {
        req.flash("error", "Listing you requested does not exist!");
        return res.redirect("/listings");
    }
    res.render("listings/show.ejs", { listing })
}
module.exports.createNewListing=async (req, res, next) => {
 let response= await geocodingClient
 .forwardGeocode({
  query: req.body.listing.location,
  limit: 1
})
  .send()
   let url= req.file.path;
   let filename=req.file.filename;
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
   newListing.image={url,filename};
   newListing.geometry=response.body.features[0].geometry;
   let savedListings= await newListing.save();
   console.log(savedListings)
    req.flash("success", "New Listing Created");
    res.redirect("/listings");

}
module.exports.renderEditForm=async (req, res) => {
    let { id } = req.params;
    const listing = await Listing.findById(id);
    if (!listing) {
        req.flash("error", "Listing you requested does not exist!");
        return res.redirect("/listings");
    }
    let originalImage=listing.image.url;
    originalImage=originalImage.replace("/upload","/upload/w_250")
    res.render("listings/edit.ejs", { listing,originalImage })
}
module.exports.updateListing=async (req, res) => {
    let { id } = req.params;
let listing= await Listing.findByIdAndUpdate(id, { ...req.body.listing });
    if(typeof req.file!=="undefined"){
      let url= req.file.path;
   let filename=req.file.filename;
   listing.image={url,filename};
   await listing.save();
    }
    req.flash("success", " Listing Updated Successfully");
    res.redirect(`/listings/${id}`);
}
module.exports.destroyListing=async (req, res) => {
    let { id } = req.params;
    let deletedListing = await Listing.findByIdAndDelete(id);
    console.log(deletedListing);
    req.flash("success", "New Listing deleted");
    res.redirect("/listings")
}