-- "Borrador" deja de usarse: un presupuesto se arma y se le da al paciente. Los que estaban en borrador pasan a "Enviado".
UPDATE budgets SET status = 'sent' WHERE status = 'draft';
