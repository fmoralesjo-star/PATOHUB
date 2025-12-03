# Configuración de ImageKit para PatosHub

## 🚀 Pasos para Configurar ImageKit

### 1. Crear Cuenta en ImageKit (Gratis)

1. Ve a https://imagekit.io
2. Haz clic en "Start Free" o "Sign Up"
3. Completa el registro (puedes usar tu cuenta de Google/GitHub)
4. Confirma tu email

### 2. Obtener Credenciales de ImageKit

Una vez dentro del Dashboard de ImageKit:

1. Ve a **"Developer Options"** en el menú lateral (o busca "API Keys" en Settings)
2. Encontrarás tres valores importantes:
   - **Public Key** (ej: `public_abc123xyz`)
   - **Private Key** (ej: `private_abcdefghijklmnopqrstuvwxyz123456`)
   - **URL Endpoint** (ej: `https://ik.imagekit.io/your_imagekit_id`)

**Nota:** El URL Endpoint también puede estar en la sección "Media Library" o "URLs" del dashboard.

### 3. Configurar Variables de Entorno en Render

1. Ve a tu servicio `PATOSHUB` en Render
2. Haz clic en **"Environment"** en el menú lateral
3. Agrega estas tres variables:

   **Variable 1:**
   - **KEY:** `IMAGEKIT_PUBLIC_KEY`
   - **VALUE:** Tu Public Key (ej: `public_abc123xyz`)

   **Variable 2:**
   - **KEY:** `IMAGEKIT_PRIVATE_KEY`
   - **VALUE:** Tu Private Key (ej: `private_abcdefghijklmnopqrstuvwxyz123456`)

   **Variable 3:**
   - **KEY:** `IMAGEKIT_URL_ENDPOINT`
   - **VALUE:** Tu URL Endpoint (ej: `https://ik.imagekit.io/your_imagekit_id`)

4. **IMPORTANTE:** Si ya tienes Cloudinary configurado, ImageKit tendrá prioridad. Si quieres usar Cloudinary, elimina las variables de ImageKit.

5. Haz clic en **"Save, rebuild, and deploy"**

### 4. Verificar que Funciona

Después de que Render redeploye (2-3 minutos):

1. Ve a la pestaña **"Logs"** en Render
2. Deberías ver: `✅ ImageKit configurado correctamente`
3. Si ves `⚠️ Ningún servicio de nube configurado, usando almacenamiento local`, verifica que las variables de entorno estén correctas

## ✅ Beneficios de ImageKit

- ✅ **20GB gratis** de almacenamiento
- ✅ **CDN global** - Las imágenes se cargan rápido en todo el mundo
- ✅ **Optimización automática** - Las imágenes se comprimen automáticamente
- ✅ **Transformaciones** - Puedes redimensionar, recortar, etc. automáticamente
- ✅ **Persistente** - Las imágenes nunca se pierden, incluso si Render redeployea
- ✅ **Escalable** - Puede manejar millones de imágenes
- ✅ **API simple** - Fácil de usar

## 🔄 Prioridad de Servicios

El sistema usa esta prioridad:
1. **ImageKit** (si está configurado)
2. **Cloudinary** (si ImageKit no está configurado pero Cloudinary sí)
3. **Almacenamiento local** (si ninguno está configurado)

## 📊 Límites del Plan Gratuito de ImageKit

- **Almacenamiento:** 20GB
- **Ancho de banda:** 20GB/mes
- **Transformaciones:** Ilimitadas
- **Soporte:** Comunidad

**Nota:** Si necesitas más, los planes de pago empiezan desde $49/mes, pero 20GB es suficiente para miles de imágenes.

## 🧪 Probar la Configuración

Una vez configurado, puedes probar subiendo una imagen desde la app Android. La URL de la imagen debería ser algo como:

```
https://ik.imagekit.io/your_imagekit_id/patoshub/imagen.jpg
```

En lugar de:

```
https://patoshub.onrender.com/uploads/imagen.jpg
```

## ❓ Solución de Problemas

### Error: "ImageKit no configurado"
- Verifica que las 3 variables de entorno estén configuradas en Render
- Verifica que los valores sean correctos (sin espacios extras)
- Reinicia el servicio en Render

### Error: "Invalid API Key"
- Verifica que copiaste correctamente el Public Key y Private Key
- Asegúrate de que no haya espacios antes o después de los valores
- Verifica que el URL Endpoint sea correcto

### Las imágenes no se suben
- Revisa los logs de Render para ver el error específico
- Verifica que el tamaño de la imagen no exceda 10MB
- Verifica que el formato sea jpg, jpeg, png, gif o webp

### Error: "URL Endpoint not found"
- Verifica que el URL Endpoint tenga el formato correcto: `https://ik.imagekit.io/your_imagekit_id`
- Asegúrate de que no tenga una barra `/` al final

## 📝 Notas Importantes

1. **Las imágenes antiguas** (almacenadas localmente o en Cloudinary) seguirán funcionando
2. **Las nuevas imágenes** se subirán a ImageKit automáticamente
3. **No necesitas migrar** las imágenes antiguas (a menos que quieras)
4. **El almacenamiento local** seguirá disponible como fallback si ImageKit falla

## 🔑 Dónde Encontrar las Credenciales

Si no encuentras las credenciales en el Dashboard:

1. **Public Key y Private Key:**
   - Ve a **Settings** → **Developer Options** → **API Keys**
   - O busca "API Keys" en el menú

2. **URL Endpoint:**
   - Ve a **Media Library** → Cualquier imagen → Copia la URL base
   - O en **Settings** → **URLs** → **ImageKit URL**
   - Formato: `https://ik.imagekit.io/your_imagekit_id`

