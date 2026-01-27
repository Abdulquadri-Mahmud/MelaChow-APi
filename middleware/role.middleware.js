const isAdmin = (req, res, next) => {
  // middleware/role.middleware.js
  // Ensures the user has an admin role
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access only' });
  }
  next();
};

export default isAdmin;
