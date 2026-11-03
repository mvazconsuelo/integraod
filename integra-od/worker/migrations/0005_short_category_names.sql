-- Nombres de categoría más cortos para que entren en las pestañas.
UPDATE treatments SET category = 'Diagnóstico' WHERE category = 'Diagnóstico y prevención';
UPDATE treatments SET category = 'Prótesis' WHERE category = 'Prótesis y estética';
