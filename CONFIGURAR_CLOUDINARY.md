# Configuración de Cloudinary para PatosHub

## 🚀 Pasos para Configurar Cloudinary

### 1. Crear Cuenta en Cloudinary (Gratis)

1. Ve a https://cloudinary.com
2. Haz clic en "Sign Up for Free"
3. Completa el registro (puedes usar tu cuenta de Google/GitHub)
4. Confirma tu email

### 2. Obtener Credenciales de Cloudinary

Una vez dentro del Dashboard de Cloudinary:

1. Ve a **Dashboard** (deberías estar ahí automáticamente)
2. En la parte superior verás tu **Cloud Name**
3. Haz clic en **"Show"** junto a **API Key** y **API Secret**
4. Copia estos tres valores:
   - **Cloud Name** (ej: `dabc123xyz`)
   - **API Key** (ej: `123456789012345`)
   - **API Secret** (ej: `abcdefghijklmnopqrstuvwxyz123456`)

### 3. Configurar Variables de Entorno en Render

1. Ve a tu servicio `PATOSHUB` en Render
2. Haz clic en **"Environment"** en el menú lateral
3. Agrega estas tres variables:

   **Variable 1:**
   - **KEY:** `CLOUDINARY_CLOUD_NAME`
   - **VALUE:** Tu Cloud Name (ej: `dabc123xyz`)

   **Variable 2:**
   - **KEY:** `CLOUDINARY_API_KEY`
   - **VALUE:** Tu API Key (ej: `123456789012345`)

   **Variable 3:**
   - **KEY:** `CLOUDINARY_API_SECRET`
   - **VALUE:** Tu API Secret (ej: `abcdefghijklmnopqrstuvwxyz123456`)

4. Haz clic en **"Save, rebuild, and deploy"**

### 4. Verificar que Funciona

Después de que Render redeploye (2-3 minutos):

1. Ve a la pestaña **"Logs"** en Render
2. Deberías ver: `✅ Cloudinary configurado correctamente`
3. Si ves `⚠️ Cloudinary no configurado, usando almacenamiento local`, verifica que las variables de entorno estén correctas

## ✅ Beneficios de Cloudinary

- ✅ **25GB gratis** de almacenamiento
- ✅ **CDN global** - Las imágenes se cargan rápido en todo el mundo
- ✅ **Optimización automática** - Las imágenes se comprimen automáticamente
- ✅ **Transformaciones** - Puedes redimensionar, recortar, etc. automáticamente
- ✅ **Persistente** - Las imágenes nunca se pierden, incluso si Render redeployea
- ✅ **Escalable** - Puede manejar millones de imágenes

## 🔄 Compatibilidad

El sistema es **compatible hacia atrás**:
- Si **NO** configuras Cloudinary, seguirá usando almacenamiento local
- Si **SÍ** configuras Cloudinary, usará Cloudinary automáticamente
- Las imágenes antiguas (locales) seguirán funcionando hasta que se eliminen

## 📊 Límites del Plan Gratuito de Cloudinary

- **Almacenamiento:** 25GB
- **Ancho de banda:** 25GB/mes
- **Transformaciones:** Ilimitadas
- **Soporte:** Comunidad

**Nota:** Si necesitas más, los planes de pago empiezan desde $89/mes, pero 25GB es suficiente para miles de imágenes.

## 🧪 Probar la Configuración

Una vez configurado, puedes probar subiendo una imagen desde la app Android. La URL de la imagen debería ser algo como:

```
https://res.cloudinary.com/tu-cloud-name/image/upload/v1234567890/patoshub/imagen.jpg
```

En lugar de:

```
https://patoshub.onrender.com/uploads/imagen.jpg
```

## ❓ Solución de Problemas

### Error: "Cloudinary no configurado"
- Verifica que las 3 variables de entorno estén configuradas en Render
- Verifica que los valores sean correctos (sin espacios extras)
- Reinicia el servicio en Render

### Error: "Invalid API Key"
- Verifica que copiaste correctamente el API Key y API Secret
- Asegúrate de que no haya espacios antes o después de los valores

### Las imágenes no se suben
- Revisa los logs de Render para ver el error específico
- Verifica que el tamaño de la imagen no exceda 10MB
- Verifica que el formato sea jpg, jpeg, png, gif o webp

## 📝 Notas Importantes

1. **Las imágenes antiguas** (almacenadas localmente) seguirán funcionando
2. **Las nuevas imágenes** se subirán a Cloudinary automáticamente
3. **No necesitas migrar** las imágenes antiguas (a menos que quieras)
4. **El almacenamiento local** seguirá disponible como fallback si Cloudinary falla

