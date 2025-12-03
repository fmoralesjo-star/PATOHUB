# PatosHub Backend API

Backend REST API para la aplicación PatosHub desarrollado con Node.js y Express.

## 🚀 Características

- ✅ Autenticación JWT
- ✅ CRUD completo para Usuarios, Negocios, Productos, Reservaciones y Disponibilidades
- ✅ Subida de imágenes (Multipart)
- ✅ CORS configurado
- ✅ Base de datos en memoria (fácil migración a PostgreSQL)

## 📋 Requisitos

- Node.js >= 18.0.0
- npm o yarn

## 🔧 Instalación

1. Instala las dependencias:
```bash
npm install
```

2. Crea un archivo `.env` basado en `.env.example`:
```bash
cp .env.example .env
```

3. Edita `.env` y configura:
```
PORT=3000
JWT_SECRET=tu_secreto_super_seguro_aqui
NODE_ENV=production
```

## 🏃 Ejecutar

### Desarrollo (con auto-reload):
```bash
npm run dev
```

### Producción:
```bash
npm start
```

El servidor estará disponible en `http://localhost:3000`

## 📡 Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/logout` - Cerrar sesión

### Usuarios
- `GET /api/users` - Obtener todos los usuarios
- `GET /api/users/:id` - Obtener usuario por ID
- `PUT /api/users/:id` - Actualizar usuario
- `DELETE /api/users/:id` - Eliminar usuario

### Negocios
- `GET /api/negocios` - Obtener todos los negocios
- `GET /api/negocios/:id` - Obtener negocio por ID
- `GET /api/negocios/dueno/:duenoId` - Obtener negocios de un dueño
- `POST /api/negocios` - Crear negocio
- `PUT /api/negocios/:id` - Actualizar negocio
- `DELETE /api/negocios/:id` - Eliminar negocio

### Productos
- `GET /api/productos` - Obtener todos los productos
- `GET /api/productos/:id` - Obtener producto por ID
- `GET /api/productos/negocio/:negocioId` - Obtener productos de un negocio
- `POST /api/productos` - Crear producto
- `PUT /api/productos/:id` - Actualizar producto
- `DELETE /api/productos/:id` - Eliminar producto

### Reservaciones
- `GET /api/reservaciones` - Obtener todas las reservaciones
- `GET /api/reservaciones/:id` - Obtener reservación por ID
- `GET /api/reservaciones/cliente/:clienteId` - Reservaciones de un cliente
- `GET /api/reservaciones/negocio/:negocioId` - Reservaciones de un negocio
- `POST /api/reservaciones` - Crear reservación
- `PUT /api/reservaciones/:id` - Actualizar reservación
- `DELETE /api/reservaciones/:id` - Eliminar reservación

### Disponibilidades
- `GET /api/disponibilidades` - Obtener todas las disponibilidades
- `GET /api/disponibilidades/negocio/:negocioId` - Disponibilidades de un negocio
- `POST /api/disponibilidades` - Crear disponibilidad
- `PUT /api/disponibilidades/:id` - Actualizar disponibilidad
- `DELETE /api/disponibilidades/:id` - Eliminar disponibilidad

### Imágenes
- `POST /api/upload/image` - Subir imagen (Multipart)
  - Parámetros: `type`, `entityId`, `image`
- `DELETE /api/upload/image?url={imageUrl}` - Eliminar imagen

## 🔐 Autenticación

Todas las rutas (excepto `/api/auth/login` y `/api/auth/register`) requieren un token JWT en el header:

```
Authorization: Bearer {token}
```

## 👤 Usuario por Defecto

- **Usuario:** `admin`
- **Contraseña:** `admin123`
- **Rol:** `ADMIN`

## 🚀 Despliegue en Render

1. Sube este código a un repositorio Git (GitHub, GitLab, etc.)
2. En Render, crea un nuevo Web Service
3. Conecta tu repositorio
4. Configura:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variables:**
     - `PORT=10000`
     - `JWT_SECRET=tu_secreto_super_seguro`
     - `NODE_ENV=production`
5. Despliega!

## 📝 Notas

- La base de datos está en memoria, los datos se perderán al reiniciar el servidor
- Para producción, migra a PostgreSQL o MongoDB
- Las imágenes se guardan en la carpeta `uploads/`
- El servidor usa el puerto definido en `PORT` o 3000 por defecto

## 🔄 Próximos Pasos

- [ ] Migrar a PostgreSQL
- [ ] Agregar validación de datos
- [ ] Implementar paginación
- [ ] Agregar tests
- [ ] Documentación con Swagger

