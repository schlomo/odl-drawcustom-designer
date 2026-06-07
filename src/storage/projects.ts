import { db } from './db'
import type { ProjectSnapshot } from './types'

export async function upsertProjectStub(snapshot: ProjectSnapshot): Promise<void> {
  await db.projects.put(snapshot)
}

export async function getProjectSnapshot(id: string): Promise<ProjectSnapshot | undefined> {
  return db.projects.get(id)
}

export async function listProjectSnapshots(): Promise<ProjectSnapshot[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray()
}
