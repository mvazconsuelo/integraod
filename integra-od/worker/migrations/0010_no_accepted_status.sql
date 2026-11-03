-- El paciente "acepta" pagando: el estado Aceptado ya no existe. Los que estaban así sin pagos vuelven a Enviado.
UPDATE budgets SET status = 'sent' WHERE status = 'accepted';
