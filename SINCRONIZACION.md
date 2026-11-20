# Datos personales de Mis recetas

El catálogo de ocho recetas, sus variantes y las fotos siguen versionados en Git. GitHub Pages puede seguir sirviendo la misma aplicación estática. Las modificaciones personales sustituyen una receta por ID al leer el catálogo. Las notas llevan la pareja de ID receta/variante y la compra es una lista por navegador. Las sesiones y los relojes pertenecen a la pestaña de cocina.

## Copia disponible hoy

Usa «Exportar copia de mis datos» en el pie del listado **en cada dispositivo, navegador y perfil que hayas utilizado**, desde el mismo dominio donde hiciste los cambios. Guarda los JSON por separado en un lugar privado. La copia conserva los valores originales con prefijo recetario:, incluidas notas, ediciones, preferencias y compra. Las fotos del catálogo se recuperan desde Git y las fotos externas siguen siendo enlaces. La copia excluye el progreso temporal de la pestaña. Conservar el archivo incluso si hay un registro ilegible.

## Propuesta para dos dispositivos

Mantener el catálogo público y almacenar solo los datos personales en un proyecto Supabase en la región elegida por Álvaro. Usar una cuenta por enlace de acceso al correo y restringir el alta tras crearla. Hacen falta el proyecto, el correo de acceso, el dominio y las URL de retorno permitidas, la URL de la API y su clave publicable. Guardar cualquier clave privilegiada exclusivamente en el servidor. Antes de activar, probar las políticas RLS de lectura, alta, modificación y borrado para el propietario y verificar el aislamiento con dos usuarios.

Separar recetas personalizadas (documento JSON con sus variantes), notas por receta/variante y filas de compra con UUID estable. Cada fila debe tener propietario, versión y marca de borrado. Descargar cambios al iniciar y recuperar el foco. Guardar operaciones pendientes en IndexedDB, enviar con ID de operación único y exigir que la versión esperada coincida en una transacción. Si dos dispositivos cambian la misma fila, conservar la edición pendiente y la remota hasta que el usuario elija. Las sesiones de cocina pueden seguir siendo locales. Para dos dispositivos no hace falta una conexión Realtime permanente.

## Migración y recuperación propuestas

1. Etiquetar la revisión del catálogo y obtener una copia de cada dispositivo. Inventariar IDs, variantes, notas, compra y referencias de imagen antes de escribir.
2. Simular la importación en un entorno de prueba. Preservar los IDs originales, comparar contenido y mostrar discrepancias por receta o nota. Para compras sin ID, asignar identificadores en un manifiesto de importación. Si ambos dispositivos contienen listas similares, revisarlas antes de sumar cantidades.
3. Registrar lote, dispositivo y huella del archivo. Importar transaccionalmente y hacer que repetir el mismo lote sea inocuo. Conservar entradas desconocidas en la copia y señalar las que requieran revisión.
4. Leer de vuelta desde una segunda sesión y cotejar recuentos y contenido con ambos archivos. Mantener los datos locales y las copias durante la transición. Ante un fallo, desactivar el adaptador remoto y volver a leer las claves originales.
5. Programar volcados privados de las tablas, fijar retención según el plan elegido y ensayar la restauración en un proyecto separado. Para recuperar una exportación local, restaurar primero sus pares clave/valor en un perfil de prueba del mismo origen, verificar el catálogo y reconciliar las diferencias antes de tocar el perfil habitual. La exportación actual no activa sincronización ni importa automáticamente archivos.

## Validación en teléfonos físicos antes de fusionar

En Safari de iPhone y Chrome de Android, abrir la variante lenta, marcar ingredientes, cambiar cantidades, avanzar dos pasos y arrancar dos relojes. Bloquear la pantalla, cambiar de aplicación, esperar a que venza un reloj y volver. Verificar el tiempo transcurrido, pausa, reanudación y liberación del bloqueo de suspensión al salir. Comprobar teclado virtual en notas y editor, foco y anuncios con VoiceOver/TalkBack, descarga y apertura del JSON, orientación horizontal y navegación con el gesto Atrás. Repetir tras recargar la pestaña. Cerrar o descartar la pestaña puede eliminar su sessionStorage; los temporizadores no son alarmas del sistema operativo.
