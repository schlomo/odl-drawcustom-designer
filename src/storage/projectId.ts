import { ACTIVE_PROJECT_ID_STORAGE_KEY } from './keys'
import { upsertProjectStub } from './projects'

function generateProjectId(): string {
  return crypto.randomUUID()
}

export function readActiveProjectId(): string | null {
  try {
    const stored = localStorage.getItem(ACTIVE_PROJECT_ID_STORAGE_KEY)
    return stored && stored.length > 0 ? stored : null
  } catch {
    return null
  }
}

export function writeActiveProjectId(projectId: string): void {
  try {
    localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, projectId)
  } catch {
    // ignore quota / private mode
  }
}

/** Returns persisted project id or creates a new UUID and stores a stub snapshot. */
export function getOrCreateActiveProjectId(): string {
  const existing = readActiveProjectId()
  if (existing) {
    return existing
  }

  const projectId = generateProjectId()
  writeActiveProjectId(projectId)
  void upsertProjectStub({
    id: projectId,
    name: 'Untitled',
    updatedAt: Date.now(),
  })
  return projectId
}

export function setActiveProjectId(projectId: string): void {
  writeActiveProjectId(projectId)
  void upsertProjectStub({
    id: projectId,
    name: 'Untitled',
    updatedAt: Date.now(),
  })
}
