import { Hono } from "hono";
import type { Env } from "../types/env";
import { parseBody } from "../middleware/validation";
import { patientCreateSchema, patientUpdateSchema } from "../schemas";
import { createPatient, deletePatient, getPatientDetail, listContacts, listPatients, updatePatient } from "../services/patients.service";

export const patients = new Hono<{ Bindings: Env }>();

patients.get("/", async (c) => c.json(await listPatients(c.env.DB)));
// El nombre va en la query (admite espacios y tildes).
patients.get("/detail", async (c) => c.json(await getPatientDetail(c.env.DB, c.req.query("name") ?? "")));

// Contactos: la lista para el buscador (nombre y teléfono), y alta y edición.
patients.get("/contacts", async (c) => c.json(await listContacts(c.env.DB)));
patients.post("/", async (c) => c.json(await createPatient(c.env.DB, await parseBody(c, patientCreateSchema)), 201));
patients.delete("/:id", async (c) => { await deletePatient(c.env.DB, c.req.param("id")); return c.body(null, 204); });
patients.put("/:id", async (c) => c.json(await updatePatient(c.env.DB, c.req.param("id"), await parseBody(c, patientUpdateSchema))));
