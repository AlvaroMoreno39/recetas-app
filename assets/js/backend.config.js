window.RECETAS_BACKEND = {
  // Ejemplo: https://xxxxxxxx.supabase.co
  url: 'https://lvgzcwjaqxcddkpxwmet.supabase.co',
  // Clave anon publica de Supabase (Settings > API > anon public)
  anonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2Z3pjd2phcXhjZGRrcHh3bWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1OTI3NjcsImV4cCI6MjA5MDE2ODc2N30.4CmREfVBIwxf0djaXzMdijMqZc81uFlZ3R7hPneMI_U',
  // Tabla para guardar el estado JSON completo de recetas
  table: 'recipes_state',
  // ID fijo de la fila compartida
  rowId: 'global',
};
