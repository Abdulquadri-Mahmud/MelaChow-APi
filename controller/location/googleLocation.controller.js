const googleKey = () => {
  if (!process.env.GOOGLE_MAPS_SERVER_API_KEY) throw Object.assign(new Error("Google Maps is not configured"), { statusCode: 503 });
  return process.env.GOOGLE_MAPS_SERVER_API_KEY;
};

export const autocompleteDeliveryAddress = async (req, res) => {
  try {
    const input = String(req.query.input || "").trim();
    if (input.length < 3) return res.json({ success: true, data: [] });
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": googleKey() }, body: JSON.stringify({ input, sessionToken: req.query.sessionToken || undefined, includedRegionCodes: ["ng"], languageCode: "en" }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
    const data = await response.json();
    return res.json({ success: true, data: (data.suggestions || []).map(row => row.placePrediction).filter(Boolean).map(place => ({ placeId: place.placeId, text: place.text?.text, mainText: place.structuredFormat?.mainText?.text, secondaryText: place.structuredFormat?.secondaryText?.text })) });
  } catch (error) { return res.status(error.statusCode || 502).json({ success: false, message: error.message }); }
};

export const getDeliveryPlaceDetails = async (req, res) => {
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(req.params.placeId)}?languageCode=en`, { headers: { "X-Goog-Api-Key": googleKey(), "X-Goog-FieldMask": "id,formattedAddress,location,addressComponents" }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Google Place Details returned ${response.status}`);
    const place = await response.json();
    const component = (type) => place.addressComponents?.find(entry => entry.types?.includes(type))?.longText || "";
    return res.json({ success: true, data: { placeId: place.id, formattedAddress: place.formattedAddress, latitude: place.location?.latitude, longitude: place.location?.longitude, city: component("locality") || component("administrative_area_level_2"), state: component("administrative_area_level_1"), postalCode: component("postal_code") } });
  } catch (error) { return res.status(error.statusCode || 502).json({ success: false, message: error.message }); }
};
