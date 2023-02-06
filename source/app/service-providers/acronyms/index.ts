import ProviderContract from '@providers/provider-contract'
import { FSWatcher } from 'chokidar'
import LogProvider from '@providers/log'
import { promises as fs } from 'fs'
import YAML from 'yaml'
import { ipcMain } from 'electron'

interface AcronymsConfig {
  options: Record<string, string|boolean>
  endings: Partial<Record<string, Partial<Record<'short'|'long', string>>>>
}
type AcronymsEntries = Record<string, Partial<Record<string, string>> & { long: string, short: string }>
type AcronymsDatabase = { items: Partial<AcronymsEntries> } & { config: Partial<AcronymsConfig> }

export default class AcronymsProvider extends ProviderContract {
  private _database: AcronymsDatabase = { items: {}, config: {} }

  /**
     * Just like the FSAL, the citeproc provider maintains a watcher for citation
     * files. If they change, or are unlinked, the provider can react to them.
     *
     * @var {FSWatcher}
     */
  private readonly _watcher: FSWatcher

  constructor (
    private readonly _logger: LogProvider
  ) {
    super()

    // Start the watcher
    this._watcher = new FSWatcher({
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
      // See for the following property the file source/main/modules/fsal/fsal-watchdog.ts
      interval: 5000,
      // Databases can become quite large, so we have to wait for it to finish
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 100
      }
    })
    this._watcher.on('all', (eventName, affectedPath) => {
      if (eventName === 'change') {
        this.loadDatabase(affectedPath, false)
          .catch(err => { this._logger.error(`[Acronyms Provider] Could not reload database ${affectedPath}: ${String(err.message)}`, err) })
      }
    })
    ipcMain.on('acronyms-provider', (event, { command, payload }) => {
      if (command === 'get-acronym') {
        const { id, classes } = payload
        event.returnValue = this.getAcronym(id, classes)
      }
      if (command === 'all-acronyms') {
        event.returnValue = this.getAcronyms()
      }
      if (command === 'all-classes') {
        event.returnValue = this.getAcronymClasses()
      }
    })
  }

  getAcronymClasses (): string[] {
    const endingClasses = Object.keys(this._database.config?.endings ?? {})
    return endingClasses
  }

  getAcronyms (): Array<{ id: string, full: string }> {
    const ids = Object.keys(this._database.items)
    return ids.map((id) => ({
      id,
      full: (this._database.items[id]?.long ?? '') + ' (' + (this._database.items[id]?.short ?? '') + ')',
      long: this._database.items[id]?.long ?? '',
      short: this._database.items[id]?.short ?? ''
    }))
  }

  getAcronym (id: string, classes: string[]): string|null {
    const item = this._database.items[id]
    if (item == null) {
      return null
    }
    let long = item.long
    let short = item.short
    let mod = classes.filter((each) => ![ 'short', 'long', 'caps' ].includes(each) && each.trim().length > 0)[0]
    if (mod) {
      const endings = this._database.config?.endings ?? {}
      long += item['long-' + mod] ?? endings[mod]?.long ?? ''
      short += item['short-' + mod] ?? endings[mod]?.short ?? ''
      if (item['long-' + mod + '-form']) {
        long = item['long-' + mod + '-form'] ?? ''
      }
      if (item['short-' + mod + '-form']) {
        short = item['short-' + mod + '-form'] ?? ''
      }
    }
    return long + ' (' + short + ')'
  }

  /**
   * This function loads a full citation database and returns it
   *
   * @param   {string}                   databasePath  The path to load the database from
   *
   * @return  {Promise<DatabaseRecord>}                Resolves with the DatabaseRecord
   */
  private async loadDatabase (databasePath: string, watch = true): Promise<void> {
    this._logger.info(`[Acronyms Provider] Loading database ${databasePath}`)
    const db: AcronymsDatabase = { items: {}, config: {} }

    // First read in the database file
    const data = await fs.readFile(databasePath, 'utf8')
    let yamlData = YAML.parse(data)
    yamlData = yamlData.acronyms
    for (const key of Object.keys(yamlData)) {
      if (key === 'options') {
        db.config.options = yamlData[key]
      } else if (key === 'endings') {
        db.config.endings = yamlData[key]
      } else {
        db.items[key] = yamlData[key]
      }
    }

    this._logger.info(`[Acronyms Provider] Database ${databasePath} loaded (${Object.keys(db.items).length} items).`)

    this._database = db

    // Now that the database has been successfully loaded, watch it for changes.
    if (watch) {
      this._watcher.add(databasePath)
    }
  }

  async boot (): Promise<void> {
    this._logger.verbose('Acronyms provider booting up ...')
    await this.loadDatabase('/home/bley/Nextcloud/Documents/Zettelkasten/acronyms.yaml', true)
  }

  async shutdown (): Promise<void> {
    this._logger.verbose('Acronyms provider shutting down ...')
    // We MUST under all circumstances properly call the close() function on
    // every chokidar process we utilize. Otherwise, the fsevents dylib will
    // still hold on to some memory after the Electron process itself shuts down
    // which will result in a crash report appearing on macOS.
    await this._watcher.close()
  }
}
