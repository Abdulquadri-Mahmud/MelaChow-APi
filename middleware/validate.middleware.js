// middleware/validate.middleware.js

// This is a **middleware generator function** called `validate`
// It accepts an array of `fields` (like ['email', 'password']) and returns middleware
const validate = (fields) => (req, res, next) => {
  // It filters through each expected field and checks if it's missing in req.body
  const missing = fields.filter(field => !req.body[field]);

  // If any field is missing, return a 400 Bad Request with details
  if (missing.length) {
    return res.status(400).json({ 
      message: `Missing fields: ${missing.join(', ')}` 
    });
  }

  // If all fields are present, move to the next middleware/controller
  next();
};

// Export the validate middleware so it can be used in routes
export default validate;
