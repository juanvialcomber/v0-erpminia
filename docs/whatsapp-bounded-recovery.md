# Recuperación puntual de evidencia WhatsApp

Alcance fijo: los nueve IDs de scripts/recover-whatsapp-evidence.mjs, organización La Patagua y grupo Planta Patagua de la instancia 710722691570. No amplía canales ni modifica configuración del proveedor.

El script se ejecuta explícitamente con --apply y --run-id desde Preview con las credenciales existentes del proyecto MOTIL. No imprime credenciales ni URL firmadas. No hay endpoint público, cron nuevo ni bucle de reintentos. Una repetición con el mismo run-id omite los registros ya intentados; originales guardados siempre se omiten. No engancharlo al build habitual.

Cada fila adquiere un lease con comparación de updated_at; mantiene contadores históricos y registra el intento manual en extraction_json.recovery, con el traspaso anterior preservado. Solo descarga desde la lista exacta de hosts ya autorizados en producción, con validación en cada redirección, límite de 12 MiB y firma binaria. Storage usa upsert=false y exige lectura/hash antes del estado stored. Los originales recuperados quedan scan_status=manual y traspasados a Producción para revisión. No se invoca visión de pago ni se promueven hechos canónicos; la fecha operacional sigue sin inferirse del timestamp del mensaje.

La ejecución puntual puede usar un Preview estático con buildCommand exclusivo del script e installCommand=node --version. Su salida pública solo contiene un mensaje de término; el resultado por identidad queda privado en la base. Esto no despliega la interfaz a producción ni cambia los ajustes permanentes del proyecto. Verificar las nueve filas y hashes al terminar. Ante fallo de proveedor, no repetir sin nueva evidencia.

Pruebas: node --test tests/whatsapp-bounded-recovery.test.mjs (9 casos).
