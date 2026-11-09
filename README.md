# Amazon Lite

Proyecto del taller de Amazon Lite. Aquí están el Gateway y los servicios de usuarios, productos y órdenes, configurados para trabajar primero en LocalStack.

## Carpetas

- `taller_gateway`: API Gateway compartido, ping y authorizer JWT.
- `taller_users`: registro, login y administración de usuarios.
- `taller_products`: catálogo y stock de productos.
- `taller_orders`: creación y seguimiento de órdenes.
- `localstack`: Docker Compose para levantar los servicios locales.

## Levantarlo en Windows

Se necesita Docker Desktop, Node.js y npm. Desde PowerShell:

```powershell
cd C:\Users\TU_USUARIO\Desktop\amazon_lite\localstack
docker compose up -d
```

Despliega primero el Gateway, porque los otros servicios importan su API y authorizer:

```powershell
cd ..\taller_gateway
npm install
npm run deploy:local

cd ..\taller_users
npm install
npm run deploy:local

cd ..\taller_products
npm install
npm run deploy:local

cd ..\taller_orders
npm install
npm run deploy:local
```

Los servicios comparten el API Gateway de LocalStack en `http://localhost:4566`. Cada despliegue muestra la URL completa de la API. Para volver a desplegar un solo módulo, entra a su carpeta y corre `npm run deploy:local`.

Para validar los tipos, corre `npm run typecheck` dentro de cada módulo.

## Frontend y CORS

Los servicios devuelven los headers CORS y API Gateway responde a las solicitudes `OPTIONS` del navegador. En LocalStack se permite cualquier origen para facilitar las pruebas. En Producción no se debe dejar `*`: configura `FRONTEND_ORIGIN` con el origen real del sitio (por ejemplo, `https://tienda.example.com`, sin una ruta al final).

## Producción

El despliegue de Producción es a AWS y es distinto del despliegue local. Antes de hacerlo:

1. Configura en AWS Systems Manager Parameter Store los parámetros `/taller/prod/jwt-secret` y, para Users, `/taller/prod/jwt-refresh-secret`.
2. Configura un perfil de AWS con permisos para los recursos de Serverless.
3. En PowerShell, establece el origen real del Frontend:

   ```powershell
   $env:FRONTEND_ORIGIN = "https://tu-dominio-real"
   ```

4. Desde la carpeta del servicio, despliega con `npx serverless deploy --stage prod --aws-profile TU_PERFIL`.

La configuración de Producción exige esos secretos de SSM y `FRONTEND_ORIGIN`; no usa los secretos de desarrollo de LocalStack como respaldo. No subas credenciales, archivos `.env` ni datos del volumen local.
