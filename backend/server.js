require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const ImageKit = require('imagekit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambiar_en_produccion';

// Configurar conexión a PostgreSQL
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL no está configurada');
  process.exit(1);
}

console.log('🔗 Configurando conexión a PostgreSQL...');
console.log('📋 DATABASE_URL recibida:', databaseUrl.replace(/:[^:@]+@/, ':****@')); // Ocultar contraseña en logs

// Limpiar y preparar la URL de conexión
let connectionString = databaseUrl.trim();

// Si la URL no tiene el dominio completo (solo tiene @dpg-xxx-a/), intentar agregarlo
if (connectionString.includes('@dpg-') && !connectionString.includes('.render.com')) {
  console.log('⚠️ URL parece estar incompleta, intentando completar...');
  // Extraer el hostname y agregar el dominio
  const match = connectionString.match(/@([^/:]+)/);
  if (match) {
    const hostname = match[1];
    // Usar oregon-postgres por defecto (ajustar si la región es diferente)
    const region = 'oregon-postgres';
    connectionString = connectionString.replace(
      `@${hostname}/`,
      `@${hostname}.${region}.render.com:5432/`
    );
    console.log('🔧 URL de base de datos ajustada para Render');
  }
} else if (connectionString.includes('.render.com')) {
  console.log('✅ URL de base de datos parece estar completa');
}

// Validar formato básico
if (!connectionString.startsWith('postgresql://') && !connectionString.startsWith('postgres://')) {
  console.error('❌ URL de base de datos no tiene el formato correcto');
  console.error('📋 Debe comenzar con postgresql:// o postgres://');
}

console.log('📋 URL final (sin contraseña):', connectionString.replace(/:[^:@]+@/, ':****@'));

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

// Inicializar tablas de la base de datos
async function initializeDatabase() {
  try {
    // Probar conexión primero
    await pool.query('SELECT NOW()');
    console.log('✅ Conexión a PostgreSQL establecida');
    // Crear tabla de usuarios
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        nombre VARCHAR(255),
        apellido VARCHAR(255),
        telefono VARCHAR(255),
        role VARCHAR(50) NOT NULL,
        tenant_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de negocios
    await pool.query(`
      CREATE TABLE IF NOT EXISTS negocios (
        id VARCHAR(255) PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        direccion TEXT,
        telefono VARCHAR(255),
        pagina_web VARCHAR(255),
        latitud DOUBLE PRECISION DEFAULT 0,
        longitud DOUBLE PRECISION DEFAULT 0,
        icono_uri TEXT,
        banner_uri TEXT,
        dueno_id VARCHAR(255) NOT NULL,
        categoria VARCHAR(255) DEFAULT 'General',
        categoria2 VARCHAR(255),
        estado VARCHAR(50),
        descripcion TEXT,
        email VARCHAR(255),
        horarios TEXT,
        color_primario VARCHAR(255),
        color_secundario VARCHAR(255),
        redes_sociales TEXT,
        informacion_adicional TEXT,
        destacado BOOLEAN DEFAULT false,
        fecha_inicio_activacion BIGINT,
        fecha_fin_activacion BIGINT,
        ocultar_al_cumplir_mes BOOLEAN DEFAULT false,
        visible_en_directorio BOOLEAN DEFAULT true,
        fecha_inicio_suscripcion BIGINT,
        fecha_fin_suscripcion BIGINT,
        suscripcion_activa BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de productos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id VARCHAR(255) PRIMARY KEY,
        negocio_id VARCHAR(255) NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        descripcion TEXT,
        precio DOUBLE PRECISION NOT NULL,
        imagen_uri TEXT,
        stock INTEGER DEFAULT 0,
        categoria VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de reservaciones
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservaciones (
        id VARCHAR(255) PRIMARY KEY,
        cliente_id VARCHAR(255) NOT NULL,
        negocio_id VARCHAR(255) NOT NULL,
        fecha TIMESTAMP NOT NULL,
        hora VARCHAR(50),
        estado VARCHAR(50) DEFAULT 'PENDIENTE',
        notas TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear tabla de disponibilidades
    await pool.query(`
      CREATE TABLE IF NOT EXISTS disponibilidades (
        id VARCHAR(255) PRIMARY KEY,
        negocio_id VARCHAR(255) NOT NULL,
        dia_semana INTEGER NOT NULL,
        hora_inicio VARCHAR(50),
        hora_fin VARCHAR(50),
        disponible BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Crear usuario admin por defecto si no existe
    const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
    if (adminCheck.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (id, username, email, password, nombre, role) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), 'admin', 'admin@patoshub.com', hashedPassword, 'Administrador', 'ADMIN']
      );
      console.log('✅ Usuario admin creado: admin / admin123');
    }

    console.log('✅ Base de datos inicializada correctamente');
  } catch (error) {
    console.error('❌ Error al inicializar la base de datos:', error);
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar servicios de almacenamiento en la nube
const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME && 
                      process.env.CLOUDINARY_API_KEY && 
                      process.env.CLOUDINARY_API_SECRET;

const useImageKit = process.env.IMAGEKIT_PUBLIC_KEY && 
                    process.env.IMAGEKIT_PRIVATE_KEY && 
                    process.env.IMAGEKIT_URL_ENDPOINT;

let imagekit;
if (useImageKit) {
  imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
  });
  console.log('✅ ImageKit configurado correctamente');
} else if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('✅ Cloudinary configurado correctamente');
} else {
  console.log('⚠️  Ningún servicio de nube configurado, usando almacenamiento local');
}

// Configurar almacenamiento: ImageKit > Cloudinary > Local
let upload;
if (useImageKit) {
  // ImageKit usa multer con almacenamiento en memoria (luego se sube a ImageKit)
  const storage = multer.memoryStorage();
  upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      if (mimetype && extname) {
        return cb(null, true);
      }
      cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif, webp)'));
    }
  });
} else if (useCloudinary) {
  // Usar Cloudinary Storage
  const cloudinaryStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'patoshub',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      transformation: [{ width: 1920, height: 1080, crop: 'limit' }], // Limitar tamaño máximo
      resource_type: 'auto'
    }
  });
  
  upload = multer({ 
    storage: cloudinaryStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      if (mimetype && extname) {
        return cb(null, true);
      }
      cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif, webp)'));
    }
  });
} else {
  // Usar almacenamiento local (fallback)
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });
  
  upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      if (mimetype && extname) {
        return cb(null, true);
      }
      cb(new Error('Solo se permiten imágenes (jpeg, jpg, png, gif, webp)'));
    }
  });
}

// Función helper para convertir snake_case a camelCase
function toCamelCase(obj) {
  if (!obj) return null;
  const result = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    result[camelKey] = obj[key];
  }
  return result;
}

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.user = user;
    next();
  });
};

// Endpoint de salud
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== AUTENTICACIÓN ==========
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userResponse = {
      id: user.id,
      username: user.username,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      telefono: user.telefono,
      role: user.role,
      tenantId: user.tenant_id
    };

    res.json({
      token,
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, nombre, apellido, telefono, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Usuario, email y contraseña requeridos' });
    }

    // Verificar si el usuario ya existe
    const userCheck = await pool.query('SELECT * FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (userCheck.rows.length > 0) {
      if (userCheck.rows[0].username === username) {
        return res.status(400).json({ error: 'El usuario ya existe' });
      }
      if (userCheck.rows[0].email === email) {
        return res.status(400).json({ error: 'El email ya está registrado' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = uuidv4();
    
    await pool.query(
      `INSERT INTO users (id, username, email, password, nombre, apellido, telefono, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, username, email, hashedPassword, nombre || null, apellido || null, telefono || null, role || 'CLIENTE', null]
    );

    const token = jwt.sign(
      { id: userId, username: username, role: role || 'CLIENTE' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const userResponse = {
      id: userId,
      username,
      email,
      nombre: nombre || null,
      apellido: apellido || null,
      telefono: telefono || null,
      role: role || 'CLIENTE',
      tenantId: null
    };

    res.status(201).json({
      token,
      user: userResponse
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Sesión cerrada exitosamente' });
});

// ========== USUARIOS ==========
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, nombre, apellido, telefono, role, tenant_id, created_at, updated_at FROM users');
    const users = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      email: row.email,
      nombre: row.nombre,
      apellido: row.apellido,
      telefono: row.telefono,
      role: row.role,
      tenantId: row.tenant_id
    }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, nombre, apellido, telefono, role, tenant_id FROM users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const user = result.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      telefono: user.telefono,
      role: user.role,
      tenantId: user.tenant_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const { password, ...updateData } = req.body;
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (updateData.username) {
      fields.push(`username = $${paramCount++}`);
      values.push(updateData.username);
    }
    if (updateData.email) {
      fields.push(`email = $${paramCount++}`);
      values.push(updateData.email);
    }
    if (updateData.nombre !== undefined) {
      fields.push(`nombre = $${paramCount++}`);
      values.push(updateData.nombre);
    }
    if (updateData.apellido !== undefined) {
      fields.push(`apellido = $${paramCount++}`);
      values.push(updateData.apellido);
    }
    if (updateData.telefono !== undefined) {
      fields.push(`telefono = $${paramCount++}`);
      values.push(updateData.telefono);
    }
    if (updateData.role) {
      fields.push(`role = $${paramCount++}`);
      values.push(updateData.role);
    }
    if (updateData.tenantId !== undefined) {
      fields.push(`tenant_id = $${paramCount++}`);
      values.push(updateData.tenantId);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id, username, email, nombre, apellido, telefono, role, tenant_id`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      telefono: user.telefono,
      role: user.role,
      tenantId: user.tenant_id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== NEGOCIOS ==========
app.get('/api/negocios', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM negocios');
    const negocios = result.rows.map(row => ({
      id: row.id,
      nombre: row.nombre,
      direccion: row.direccion,
      telefono: row.telefono,
      paginaWeb: row.pagina_web,
      latitud: row.latitud,
      longitud: row.longitud,
      iconoUri: row.icono_uri,
      bannerUri: row.banner_uri,
      duenoId: row.dueno_id,
      categoria: row.categoria,
      categoria2: row.categoria2,
      estado: row.estado,
      descripcion: row.descripcion,
      email: row.email,
      horarios: row.horarios,
      colorPrimario: row.color_primario,
      colorSecundario: row.color_secundario,
      redesSociales: row.redes_sociales,
      informacionAdicional: row.informacion_adicional,
      destacado: row.destacado,
      fechaInicioActivacion: row.fecha_inicio_activacion,
      fechaFinActivacion: row.fecha_fin_activacion,
      ocultarAlCumplirMes: row.ocultar_al_cumplir_mes,
      visibleEnDirectorio: row.visible_en_directorio,
      fechaInicioSuscripcion: row.fecha_inicio_suscripcion,
      fechaFinSuscripcion: row.fecha_fin_suscripcion,
      suscripcionActiva: row.suscripcion_activa
    }));
    res.json(negocios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/negocios/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM negocios WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      nombre: row.nombre,
      direccion: row.direccion,
      telefono: row.telefono,
      paginaWeb: row.pagina_web,
      latitud: row.latitud,
      longitud: row.longitud,
      iconoUri: row.icono_uri,
      bannerUri: row.banner_uri,
      duenoId: row.dueno_id,
      categoria: row.categoria,
      categoria2: row.categoria2,
      estado: row.estado,
      descripcion: row.descripcion,
      email: row.email,
      horarios: row.horarios,
      colorPrimario: row.color_primario,
      colorSecundario: row.color_secundario,
      redesSociales: row.redes_sociales,
      informacionAdicional: row.informacion_adicional,
      destacado: row.destacado,
      fechaInicioActivacion: row.fecha_inicio_activacion,
      fechaFinActivacion: row.fecha_fin_activacion,
      ocultarAlCumplirMes: row.ocultar_al_cumplir_mes,
      visibleEnDirectorio: row.visible_en_directorio,
      fechaInicioSuscripcion: row.fecha_inicio_suscripcion,
      fechaFinSuscripcion: row.fecha_fin_suscripcion,
      suscripcionActiva: row.suscripcion_activa
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/negocios/dueno/:duenoId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM negocios WHERE dueno_id = $1', [req.params.duenoId]);
    const negocios = result.rows.map(row => ({
      id: row.id,
      nombre: row.nombre,
      direccion: row.direccion,
      telefono: row.telefono,
      paginaWeb: row.pagina_web,
      latitud: row.latitud,
      longitud: row.longitud,
      iconoUri: row.icono_uri,
      bannerUri: row.banner_uri,
      duenoId: row.dueno_id,
      categoria: row.categoria,
      categoria2: row.categoria2,
      estado: row.estado,
      descripcion: row.descripcion,
      email: row.email,
      horarios: row.horarios,
      colorPrimario: row.color_primario,
      colorSecundario: row.color_secundario,
      redesSociales: row.redes_sociales,
      informacionAdicional: row.informacion_adicional,
      destacado: row.destacado,
      fechaInicioActivacion: row.fecha_inicio_activacion,
      fechaFinActivacion: row.fecha_fin_activacion,
      ocultarAlCumplirMes: row.ocultar_al_cumplir_mes,
      visibleEnDirectorio: row.visible_en_directorio,
      fechaInicioSuscripcion: row.fecha_inicio_suscripcion,
      fechaFinSuscripcion: row.fecha_fin_suscripcion,
      suscripcionActiva: row.suscripcion_activa
    }));
    res.json(negocios);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/negocios', authenticateToken, async (req, res) => {
  try {
    const negocioId = uuidv4();
    const {
      nombre, direccion, telefono, paginaWeb, latitud, longitud, iconoUri, bannerUri,
      duenoId, categoria, categoria2, estado, descripcion, email, horarios,
      colorPrimario, colorSecundario, redesSociales, informacionAdicional, destacado,
      fechaInicioActivacion, fechaFinActivacion, ocultarAlCumplirMes, visibleEnDirectorio,
      fechaInicioSuscripcion, fechaFinSuscripcion, suscripcionActiva
    } = req.body;

    await pool.query(
      `INSERT INTO negocios (
        id, nombre, direccion, telefono, pagina_web, latitud, longitud, icono_uri, banner_uri,
        dueno_id, categoria, categoria2, estado, descripcion, email, horarios,
        color_primario, color_secundario, redes_sociales, informacion_adicional, destacado,
        fecha_inicio_activacion, fecha_fin_activacion, ocultar_al_cumplir_mes, visible_en_directorio,
        fecha_inicio_suscripcion, fecha_fin_suscripcion, suscripcion_activa
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27, $28
      )`,
      [
        negocioId, nombre, direccion, telefono, paginaWeb, latitud || 0, longitud || 0, iconoUri, bannerUri,
        duenoId, categoria || 'General', categoria2, estado, descripcion, email, horarios,
        colorPrimario, colorSecundario, redesSociales, informacionAdicional, destacado || false,
        fechaInicioActivacion, fechaFinActivacion, ocultarAlCumplirMes || false, visibleEnDirectorio !== undefined ? visibleEnDirectorio : true,
        fechaInicioSuscripcion, fechaFinSuscripcion, suscripcionActiva || false
      ]
    );

    const result = await pool.query('SELECT * FROM negocios WHERE id = $1', [negocioId]);
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      nombre: row.nombre,
      direccion: row.direccion,
      telefono: row.telefono,
      paginaWeb: row.pagina_web,
      latitud: row.latitud,
      longitud: row.longitud,
      iconoUri: row.icono_uri,
      bannerUri: row.banner_uri,
      duenoId: row.dueno_id,
      categoria: row.categoria,
      categoria2: row.categoria2,
      estado: row.estado,
      descripcion: row.descripcion,
      email: row.email,
      horarios: row.horarios,
      colorPrimario: row.color_primario,
      colorSecundario: row.color_secundario,
      redesSociales: row.redes_sociales,
      informacionAdicional: row.informacion_adicional,
      destacado: row.destacado,
      fechaInicioActivacion: row.fecha_inicio_activacion,
      fechaFinActivacion: row.fecha_fin_activacion,
      ocultarAlCumplirMes: row.ocultar_al_cumplir_mes,
      visibleEnDirectorio: row.visible_en_directorio,
      fechaInicioSuscripcion: row.fecha_inicio_suscripcion,
      fechaFinSuscripcion: row.fecha_fin_suscripcion,
      suscripcionActiva: row.suscripcion_activa
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/negocios/:id', authenticateToken, async (req, res) => {
  try {
    const {
      nombre, direccion, telefono, paginaWeb, latitud, longitud, iconoUri, bannerUri,
      duenoId, categoria, categoria2, estado, descripcion, email, horarios,
      colorPrimario, colorSecundario, redesSociales, informacionAdicional, destacado,
      fechaInicioActivacion, fechaFinActivacion, ocultarAlCumplirMes, visibleEnDirectorio,
      fechaInicioSuscripcion, fechaFinSuscripcion, suscripcionActiva
    } = req.body;

    const fields = [];
    const values = [];
    let paramCount = 1;

    if (nombre !== undefined) { fields.push(`nombre = $${paramCount++}`); values.push(nombre); }
    if (direccion !== undefined) { fields.push(`direccion = $${paramCount++}`); values.push(direccion); }
    if (telefono !== undefined) { fields.push(`telefono = $${paramCount++}`); values.push(telefono); }
    if (paginaWeb !== undefined) { fields.push(`pagina_web = $${paramCount++}`); values.push(paginaWeb); }
    if (latitud !== undefined) { fields.push(`latitud = $${paramCount++}`); values.push(latitud); }
    if (longitud !== undefined) { fields.push(`longitud = $${paramCount++}`); values.push(longitud); }
    if (iconoUri !== undefined) { fields.push(`icono_uri = $${paramCount++}`); values.push(iconoUri); }
    if (bannerUri !== undefined) { fields.push(`banner_uri = $${paramCount++}`); values.push(bannerUri); }
    if (duenoId !== undefined) { fields.push(`dueno_id = $${paramCount++}`); values.push(duenoId); }
    if (categoria !== undefined) { fields.push(`categoria = $${paramCount++}`); values.push(categoria); }
    if (categoria2 !== undefined) { fields.push(`categoria2 = $${paramCount++}`); values.push(categoria2); }
    if (estado !== undefined) { fields.push(`estado = $${paramCount++}`); values.push(estado); }
    if (descripcion !== undefined) { fields.push(`descripcion = $${paramCount++}`); values.push(descripcion); }
    if (email !== undefined) { fields.push(`email = $${paramCount++}`); values.push(email); }
    if (horarios !== undefined) { fields.push(`horarios = $${paramCount++}`); values.push(horarios); }
    if (colorPrimario !== undefined) { fields.push(`color_primario = $${paramCount++}`); values.push(colorPrimario); }
    if (colorSecundario !== undefined) { fields.push(`color_secundario = $${paramCount++}`); values.push(colorSecundario); }
    if (redesSociales !== undefined) { fields.push(`redes_sociales = $${paramCount++}`); values.push(redesSociales); }
    if (informacionAdicional !== undefined) { fields.push(`informacion_adicional = $${paramCount++}`); values.push(informacionAdicional); }
    if (destacado !== undefined) { fields.push(`destacado = $${paramCount++}`); values.push(destacado); }
    if (fechaInicioActivacion !== undefined) { fields.push(`fecha_inicio_activacion = $${paramCount++}`); values.push(fechaInicioActivacion); }
    if (fechaFinActivacion !== undefined) { fields.push(`fecha_fin_activacion = $${paramCount++}`); values.push(fechaFinActivacion); }
    if (ocultarAlCumplirMes !== undefined) { fields.push(`ocultar_al_cumplir_mes = $${paramCount++}`); values.push(ocultarAlCumplirMes); }
    if (visibleEnDirectorio !== undefined) { fields.push(`visible_en_directorio = $${paramCount++}`); values.push(visibleEnDirectorio); }
    if (fechaInicioSuscripcion !== undefined) { fields.push(`fecha_inicio_suscripcion = $${paramCount++}`); values.push(fechaInicioSuscripcion); }
    if (fechaFinSuscripcion !== undefined) { fields.push(`fecha_fin_suscripcion = $${paramCount++}`); values.push(fechaFinSuscripcion); }
    if (suscripcionActiva !== undefined) { fields.push(`suscripcion_activa = $${paramCount++}`); values.push(suscripcionActiva); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);

    const query = `UPDATE negocios SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      nombre: row.nombre,
      direccion: row.direccion,
      telefono: row.telefono,
      paginaWeb: row.pagina_web,
      latitud: row.latitud,
      longitud: row.longitud,
      iconoUri: row.icono_uri,
      bannerUri: row.banner_uri,
      duenoId: row.dueno_id,
      categoria: row.categoria,
      categoria2: row.categoria2,
      estado: row.estado,
      descripcion: row.descripcion,
      email: row.email,
      horarios: row.horarios,
      colorPrimario: row.color_primario,
      colorSecundario: row.color_secundario,
      redesSociales: row.redes_sociales,
      informacionAdicional: row.informacion_adicional,
      destacado: row.destacado,
      fechaInicioActivacion: row.fecha_inicio_activacion,
      fechaFinActivacion: row.fecha_fin_activacion,
      ocultarAlCumplirMes: row.ocultar_al_cumplir_mes,
      visibleEnDirectorio: row.visible_en_directorio,
      fechaInicioSuscripcion: row.fecha_inicio_suscripcion,
      fechaFinSuscripcion: row.fecha_fin_suscripcion,
      suscripcionActiva: row.suscripcion_activa
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/negocios/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM negocios WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Negocio no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== PRODUCTOS ==========
app.get('/api/productos', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos');
    const productos = result.rows.map(row => ({
      id: row.id,
      negocioId: row.negocio_id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      precio: row.precio,
      imagenUri: row.imagen_uri,
      stock: row.stock,
      categoria: row.categoria
    }));
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      negocioId: row.negocio_id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      precio: row.precio,
      imagenUri: row.imagen_uri,
      stock: row.stock,
      categoria: row.categoria
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/productos/negocio/:negocioId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos WHERE negocio_id = $1', [req.params.negocioId]);
    const productos = result.rows.map(row => ({
      id: row.id,
      negocioId: row.negocio_id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      precio: row.precio,
      imagenUri: row.imagen_uri,
      stock: row.stock,
      categoria: row.categoria
    }));
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/productos', authenticateToken, async (req, res) => {
  try {
    const productoId = uuidv4();
    const { negocioId, nombre, descripcion, precio, imagenUri, stock, categoria } = req.body;

    await pool.query(
      `INSERT INTO productos (id, negocio_id, nombre, descripcion, precio, imagen_uri, stock, categoria)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [productoId, negocioId, nombre, descripcion, precio, imagenUri, stock || 0, categoria]
    );

    const result = await pool.query('SELECT * FROM productos WHERE id = $1', [productoId]);
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      negocioId: row.negocio_id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      precio: row.precio,
      imagenUri: row.imagen_uri,
      stock: row.stock,
      categoria: row.categoria
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const { negocioId, nombre, descripcion, precio, imagenUri, stock, categoria } = req.body;
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (negocioId !== undefined) { fields.push(`negocio_id = $${paramCount++}`); values.push(negocioId); }
    if (nombre !== undefined) { fields.push(`nombre = $${paramCount++}`); values.push(nombre); }
    if (descripcion !== undefined) { fields.push(`descripcion = $${paramCount++}`); values.push(descripcion); }
    if (precio !== undefined) { fields.push(`precio = $${paramCount++}`); values.push(precio); }
    if (imagenUri !== undefined) { fields.push(`imagen_uri = $${paramCount++}`); values.push(imagenUri); }
    if (stock !== undefined) { fields.push(`stock = $${paramCount++}`); values.push(stock); }
    if (categoria !== undefined) { fields.push(`categoria = $${paramCount++}`); values.push(categoria); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);

    const query = `UPDATE productos SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      negocioId: row.negocio_id,
      nombre: row.nombre,
      descripcion: row.descripcion,
      precio: row.precio,
      imagenUri: row.imagen_uri,
      stock: row.stock,
      categoria: row.categoria
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/productos/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== RESERVACIONES ==========
app.get('/api/reservaciones', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reservaciones');
    const reservaciones = result.rows.map(row => ({
      id: row.id,
      clienteId: row.cliente_id,
      negocioId: row.negocio_id,
      fecha: row.fecha,
      hora: row.hora,
      estado: row.estado,
      notas: row.notas
    }));
    res.json(reservaciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reservaciones/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reservaciones WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservación no encontrada' });
    }
    const row = result.rows[0];
    res.json({
      id: row.id,
      clienteId: row.cliente_id,
      negocioId: row.negocio_id,
      fecha: row.fecha,
      hora: row.hora,
      estado: row.estado,
      notas: row.notas
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reservaciones/cliente/:clienteId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reservaciones WHERE cliente_id = $1', [req.params.clienteId]);
    const reservaciones = result.rows.map(row => ({
      id: row.id,
      clienteId: row.cliente_id,
      negocioId: row.negocio_id,
      fecha: row.fecha,
      hora: row.hora,
      estado: row.estado,
      notas: row.notas
    }));
    res.json(reservaciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reservaciones/negocio/:negocioId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reservaciones WHERE negocio_id = $1', [req.params.negocioId]);
    const reservaciones = result.rows.map(row => ({
      id: row.id,
      clienteId: row.cliente_id,
      negocioId: row.negocio_id,
      fecha: row.fecha,
      hora: row.hora,
      estado: row.estado,
      notas: row.notas
    }));
    res.json(reservaciones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reservaciones', authenticateToken, async (req, res) => {
  try {
    const reservacionId = uuidv4();
    const { clienteId, negocioId, fecha, hora, estado, notas } = req.body;

    await pool.query(
      `INSERT INTO reservaciones (id, cliente_id, negocio_id, fecha, hora, estado, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [reservacionId, clienteId, negocioId, fecha, hora, estado || 'PENDIENTE', notas]
    );

    const result = await pool.query('SELECT * FROM reservaciones WHERE id = $1', [reservacionId]);
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      clienteId: row.cliente_id,
      negocioId: row.negocio_id,
      fecha: row.fecha,
      hora: row.hora,
      estado: row.estado,
      notas: row.notas
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/reservaciones/:id', authenticateToken, async (req, res) => {
  try {
    const { clienteId, negocioId, fecha, hora, estado, notas } = req.body;
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (clienteId !== undefined) { fields.push(`cliente_id = $${paramCount++}`); values.push(clienteId); }
    if (negocioId !== undefined) { fields.push(`negocio_id = $${paramCount++}`); values.push(negocioId); }
    if (fecha !== undefined) { fields.push(`fecha = $${paramCount++}`); values.push(fecha); }
    if (hora !== undefined) { fields.push(`hora = $${paramCount++}`); values.push(hora); }
    if (estado !== undefined) { fields.push(`estado = $${paramCount++}`); values.push(estado); }
    if (notas !== undefined) { fields.push(`notas = $${paramCount++}`); values.push(notas); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);

    const query = `UPDATE reservaciones SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reservación no encontrada' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      clienteId: row.cliente_id,
      negocioId: row.negocio_id,
      fecha: row.fecha,
      hora: row.hora,
      estado: row.estado,
      notas: row.notas
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/reservaciones/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM reservaciones WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Reservación no encontrada' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== DISPONIBILIDADES ==========
app.get('/api/disponibilidades', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM disponibilidades');
    const disponibilidades = result.rows.map(row => ({
      id: row.id,
      negocioId: row.negocio_id,
      diaSemana: row.dia_semana,
      horaInicio: row.hora_inicio,
      horaFin: row.hora_fin,
      disponible: row.disponible
    }));
    res.json(disponibilidades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/disponibilidades/negocio/:negocioId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM disponibilidades WHERE negocio_id = $1', [req.params.negocioId]);
    const disponibilidades = result.rows.map(row => ({
      id: row.id,
      negocioId: row.negocio_id,
      diaSemana: row.dia_semana,
      horaInicio: row.hora_inicio,
      horaFin: row.hora_fin,
      disponible: row.disponible
    }));
    res.json(disponibilidades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/disponibilidades', authenticateToken, async (req, res) => {
  try {
    const disponibilidadId = uuidv4();
    const { negocioId, diaSemana, horaInicio, horaFin, disponible } = req.body;

    await pool.query(
      `INSERT INTO disponibilidades (id, negocio_id, dia_semana, hora_inicio, hora_fin, disponible)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [disponibilidadId, negocioId, diaSemana, horaInicio, horaFin, disponible !== undefined ? disponible : true]
    );

    const result = await pool.query('SELECT * FROM disponibilidades WHERE id = $1', [disponibilidadId]);
    const row = result.rows[0];
    res.status(201).json({
      id: row.id,
      negocioId: row.negocio_id,
      diaSemana: row.dia_semana,
      horaInicio: row.hora_inicio,
      horaFin: row.hora_fin,
      disponible: row.disponible
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/disponibilidades/:id', authenticateToken, async (req, res) => {
  try {
    const { negocioId, diaSemana, horaInicio, horaFin, disponible } = req.body;
    const fields = [];
    const values = [];
    let paramCount = 1;

    if (negocioId !== undefined) { fields.push(`negocio_id = $${paramCount++}`); values.push(negocioId); }
    if (diaSemana !== undefined) { fields.push(`dia_semana = $${paramCount++}`); values.push(diaSemana); }
    if (horaInicio !== undefined) { fields.push(`hora_inicio = $${paramCount++}`); values.push(horaInicio); }
    if (horaFin !== undefined) { fields.push(`hora_fin = $${paramCount++}`); values.push(horaFin); }
    if (disponible !== undefined) { fields.push(`disponible = $${paramCount++}`); values.push(disponible); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(req.params.id);

    const query = `UPDATE disponibilidades SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Disponibilidad no encontrada' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      negocioId: row.negocio_id,
      diaSemana: row.dia_semana,
      horaInicio: row.hora_inicio,
      horaFin: row.hora_fin,
      disponible: row.disponible
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/disponibilidades/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM disponibilidades WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Disponibilidad no encontrada' });
    }
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== SUBIDA DE IMÁGENES ==========
app.post('/api/upload/image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    const { type, entityId } = req.body;
    
    // Si se usa Cloudinary, req.file.path contiene la URL de Cloudinary
    // Si se usa almacenamiento local, construimos la URL local
    let imageUrl;
    if (useCloudinary && req.file.path) {
      imageUrl = req.file.path; // URL completa de Cloudinary
    } else {
      imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    }

    res.json({
      url: imageUrl,
      message: 'Imagen subida exitosamente',
      type: type,
      entityId: entityId,
      storage: useCloudinary ? 'cloudinary' : 'local'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/upload/image', authenticateToken, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL de imagen requerida' });
    }

    if (useImageKit && url.includes('imagekit.io')) {
      // Eliminar de ImageKit
      try {
        // Extraer el fileId o filePath de la URL de ImageKit
        // Formato: https://ik.imagekit.io/your_imagekit_id/patoshub/filename.jpg
        const urlParts = url.split('/');
        const imagekitIndex = urlParts.findIndex(part => part.includes('imagekit.io'));
        if (imagekitIndex !== -1) {
          // Obtener la ruta después del dominio
          const filePath = '/' + urlParts.slice(imagekitIndex + 1).join('/');
          
          // Buscar el archivo por path
          const files = await imagekit.listFiles({
            path: filePath
          });
          
          if (files && files.length > 0) {
            const fileId = files[0].fileId;
            await imagekit.deleteFile(fileId);
            return res.json({ message: 'Imagen eliminada exitosamente de ImageKit' });
          } else {
            return res.status(404).json({ error: 'Imagen no encontrada en ImageKit' });
          }
        }
      } catch (imagekitError) {
        console.error('Error al eliminar de ImageKit:', imagekitError);
        return res.status(500).json({ error: 'Error al eliminar imagen de ImageKit' });
      }
    } else if (useCloudinary && url.includes('cloudinary.com')) {
      // Eliminar de Cloudinary
      try {
        // Extraer el public_id de la URL de Cloudinary
        // Formato: https://res.cloudinary.com/cloud_name/image/upload/v1234567890/patoshub/filename.jpg
        const urlParts = url.split('/');
        const uploadIndex = urlParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1 && urlParts[uploadIndex + 1]) {
          // Obtener la parte después de 'upload'
          const afterUpload = urlParts.slice(uploadIndex + 2).join('/');
          const publicId = afterUpload.replace(/\.[^/.]+$/, ''); // Remover extensión
          
          const result = await cloudinary.uploader.destroy(publicId);
          if (result.result === 'ok') {
            return res.json({ message: 'Imagen eliminada exitosamente de Cloudinary' });
          } else {
            return res.status(404).json({ error: 'Imagen no encontrada en Cloudinary' });
          }
        }
      } catch (cloudinaryError) {
        console.error('Error al eliminar de Cloudinary:', cloudinaryError);
        return res.status(500).json({ error: 'Error al eliminar imagen de Cloudinary' });
      }
    } else {
      // Eliminar de almacenamiento local
      const uploadsDir = path.join(__dirname, 'uploads');
      const filename = url.split('/').pop();
      const filePath = path.join(uploadsDir, filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ message: 'Imagen eliminada exitosamente' });
      } else {
        res.status(404).json({ error: 'Imagen no encontrada' });
      }
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Servir archivos estáticos de uploads (solo si no se usa ningún servicio en la nube)
if (!useImageKit && !useCloudinary) {
  const uploadsDir = path.join(__dirname, 'uploads');
  app.use('/uploads', express.static(uploadsDir));
}

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Inicializar base de datos y luego iniciar servidor
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`🔐 Usuario admin por defecto: admin / admin123`);
    console.log(`🗄️  Base de datos PostgreSQL conectada`);
  });
}).catch(error => {
  console.error('❌ Error al inicializar:', error);
  process.exit(1);
});

