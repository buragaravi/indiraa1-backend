import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'RaviBuraga';

export function authenticateAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'No token.' });
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    // Accept any token with isAdmin: true and adminId (for DB admins)
    if (!decoded.isAdmin || !decoded.adminId) return res.status(403).json({ message: 'Admin only.' });
    req.user = decoded;
    next();
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid token.' });
  }
}

export function authenticateUser(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'No token.' });
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid token.' });
  }
}

export function authenticateSubAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'No token.' });
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    // Accept tokens with isSubAdmin: true or isAdmin: true (admins can access sub-admin routes)
    if (!decoded.isSubAdmin && !decoded.isAdmin) {
      return res.status(403).json({ message: 'Sub-admin or admin access required.' });
    }
    req.user = decoded;
    next();
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid token.' });
  }
}

export function authenticateAdminOrSubAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'No token.' });
  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    // Accept both admin and sub-admin tokens
    if (!decoded.isAdmin && !decoded.isSubAdmin) {
      return res.status(403).json({ message: 'Admin or sub-admin access required.' });
    }
    req.user = decoded;
    next();
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid token.' });
  }
}
