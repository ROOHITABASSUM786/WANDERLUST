const Listing=require("../models/listing")
const { GoogleGenAI } = require("@google/genai");

const axios = require("axios");
const formatListingRatings = (listings) => {
    return listings.map(listing => {
        const listingObj = listing.toObject ? listing.toObject() : listing;
        const reviews = listingObj.reviews || [];
        const reviewCount = reviews.length;
        let avgRating = null;
        if (reviewCount > 0) {
            const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
            avgRating = sum / reviewCount;
        }
        return {
            ...listingObj,
            avgRating,
            reviewCount
        };
    });
};

module.exports.index = async (req, res) => {
    const { category } = req.query;
    let filter = {};
    if (category) {
        filter.category = category;
    }
    const rawListings = await Listing.find(filter).populate("reviews");
    const allListings = formatListingRatings(rawListings);
    res.render("listings/index.ejs", { allListings, category });
};

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
module.exports.createNewListing = async (req, res, next) => {
    let url = req.file.path;
    let filename = req.file.filename;
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
    newListing.image = { url, filename };

    // Free OpenStreetMap Geocoding via Nominatim API
    const locationQuery = req.body.listing.location;
    let geometry = { type: "Point", coordinates: [77.2090, 28.6139] }; // Default fallback coordinates

    try {
        const geoResponse = await axios.get("https://nominatim.openstreetmap.org/search", {
            params: { q: locationQuery, format: "json", limit: 1 },
            headers: { "User-Agent": "WanderlustApp" }
        });

        if (geoResponse.data && geoResponse.data.length > 0) {
            const lat = parseFloat(geoResponse.data[0].lat);
            const lon = parseFloat(geoResponse.data[0].lon);
            geometry = { type: "Point", coordinates: [lon, lat] }; // GeoJSON format: [longitude, latitude]
        }
    } catch (err) {
        console.log("Geocoding Error:", err.message);
    }

    newListing.geometry = geometry;
    let savedListings = await newListing.save();
    console.log(savedListings);
    req.flash("success", "New Listing Created");
    res.redirect("/listings");
};
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

module.exports.searchListings = async (req, res) => {
    let { q } = req.query;
    if (!q || q.trim() === "") {
        return res.redirect("/listings");
    }
    let query = q.trim();
    const rawListings = await Listing.find({
        $or: [
            { title: { $regex: query, $options: "i" } },
            { location: { $regex: query, $options: "i" } },
            { country: { $regex: query, $options: "i" } },
            { description: { $regex: query, $options: "i" } }
        ]
    }).populate("reviews");
    const allListings = formatListingRatings(rawListings);
    res.render("listings/index.ejs", { allListings });
}

module.exports.renderAiPage = async (req, res) => {
    const rawListings = await Listing.find({}).populate("reviews").limit(6);
    const featuredListings = formatListingRatings(rawListings);
    res.render("ai.ejs", { featuredListings });
};

// In-memory cache for ultra-fast RAG database context
let cachedDatabaseContext = null;
let lastContextCacheTime = 0;

async function getFastDatabaseContext() {
    const NOW = Date.now();
    // Use cached database context for 60 seconds to eliminate repeated DB round-trips
    if (cachedDatabaseContext && (NOW - lastContextCacheTime < 60000)) {
        return cachedDatabaseContext;
    }

    const listings = await Listing.find({})
        .select("title location country price category _id")
        .lean();

    cachedDatabaseContext = listings.map(item => 
        `- Title: "${item.title}" | Link: /listings/${item._id} | Location: ${item.location}, ${item.country} | Price: $${item.price} | Category: ${item.category}`
    ).join("\n");

    lastContextCacheTime = NOW;
    return cachedDatabaseContext;
}

module.exports.processAiQuery = async (req, res) => {
    const userPrompt = req.body.prompt;
    if (!userPrompt || !userPrompt.trim()) {
        return res.json({ text: "Please enter a travel question or topic!" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
        return res.json({ text: "GEMINI_API_KEY is missing in your `.env` file or environment variables." });
    }

    try {
        // Fetch ultra-fast cached database context (0ms latency on repeated queries)
        const databaseContext = await getFastDatabaseContext();

        // System Instruction with live Database Context
        const systemInstruction = `You are the official AI Assistant for the Wanderlust travel booking website.
You have real-time access to our live MongoDB property listings:

${databaseContext}

CRITICAL INSTRUCTIONS:
1. Whenever you mention, suggest, or list a property, you MUST format its title as a Markdown link using its exact Link URL provided above. Example: [Property Title](/listings/12345).
2. NEVER output property titles as plain text. Always make the title a clickable link [Title](/listings/ID).
3. Answer general travel questions dynamically with helpful advice and custom itineraries.
4. Format your entire response in clean, beautiful Markdown.`;

        // Call Gemini AI Model with fallback candidates and 1-sec auto-retry
        const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
        const candidateModels = ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

        for (const modelName of candidateModels) {
            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    const response = await ai.models.generateContent({
                        model: modelName,
                        contents: userPrompt,
                        config: { 
                            systemInstruction,
                            maxOutputTokens: 600
                        }
                    });
                    if (response && response.text) {
                        return res.json({ text: response.text });
                    }
                } catch (err) {
                    console.warn(`Model ${modelName} attempt ${attempt} failed:`, err.message || err);
                    const status = err.status || (err.error && err.error.code);
                    if ((status === 429 || status === 503) && attempt === 1) {
                        await new Promise(resolve => setTimeout(resolve, 800));
                        continue;
                    }
                    break;
                }
            }
        }

        return res.json({ text: "Google Gen AI is currently busy due to rate limits. Please wait 5 seconds and try again!" });
    } catch (err) {
        console.error("Gemini AI General Error:", err);
        return res.json({ text: "An error occurred while connecting to Wanderlust AI." });
    }
};

module.exports.renderFavorites = async (req, res) => {
    const rawListings = await Listing.find({}).populate("reviews");
    const allListings = formatListingRatings(rawListings);
    res.render("listings/index.ejs", { allListings, isFavoritesPage: true });
};