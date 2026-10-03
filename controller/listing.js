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

// Helper function to check if the prompt requires database property context
const requiresDatabaseContext = (text) => {
    const propertyKeywords = [
        'place', 'stay', 'property', 'hotel', 'villa', 'chalet', 'room', 'house', 'loft',
        'under', 'budget', 'price', 'dollar', '$', 'cost', 'cheap', 'expensive',
        'recommend', 'where', 'destination', 'location', 'view', 'pool', 'castle',
        'mountain', 'beach', 'city', 'snow', 'summer', 'winter', 'farm', 'arctic', 'boat'
    ];
    const lower = text.toLowerCase();
    return propertyKeywords.some(kw => lower.includes(kw));
};

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
        let systemInstruction = "";

        if (requiresDatabaseContext(userPrompt)) {
            // RAG Query: Attach MongoDB property listings context for property searches
            const databaseContext = await getFastDatabaseContext();
            systemInstruction = `You are Wanderlust AI, an expert travel companion for the Wanderlust property booking platform.

Here are the live available property listings from our Wanderlust database:
${databaseContext}

Role & Output Guidelines:
- Help users explore destinations, answer travel questions, and recommend stays.
- When recommending any property from our collection, always format its title as a Markdown link using its exact relative link provided above (e.g. [Property Title](/listings/12345)).
- Present your answer in clean, well-structured Markdown with emojis and clear headings.`;
        } else {
            // General Chat Query: Lightweight instruction for blazing-fast 0.2s response
            systemInstruction = `You are Wanderlust AI, a friendly, concise travel companion for the Wanderlust web application. Answer user greetings, general chat, and general travel advice quickly, warmly, and concisely in clean Markdown.`;
        }

        // Call Gemini AI Model with fallback candidates and auto-retry
        const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
        const candidateModels = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-1.5-flash-latest', 'gemini-2.5-pro'];

        for (const modelName of candidateModels) {
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const response = await ai.models.generateContent({
                        model: modelName,
                        contents: userPrompt,
                        config: { 
                            systemInstruction,
                            maxOutputTokens: 2500
                        }
                    });
                    if (response && response.text) {
                        return res.json({ text: response.text });
                    }
                } catch (err) {
                    console.warn(`Model ${modelName} attempt ${attempt} failed:`, err.message || err);
                    const status = err.status || (err.error && err.error.code);
                    // If model not found (404), break immediately to try the next model candidate
                    if (status === 404) {
                        break;
                    }
                    // If rate limit (429) or high demand (503), wait with exponential backoff before retrying
                    if ((status === 429 || status === 503) && attempt < 3) {
                        const delay = attempt * 800;
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                    break;
                }
            }
        }

        return res.json({ text: "Google Gen AI is currently processing high traffic. Please wait a few seconds and try again!" });
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