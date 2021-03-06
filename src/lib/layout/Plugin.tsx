/* eslint-disable no-use-before-define */
import Listenable from "../modules/listenable"
import { WindowClass } from "./Window"
import { PluginContext } from "./Context"
import { Application } from "../application"

export class PluginClass {
  name: string
  instance: PluginInstance
  component: typeof PluginInstance
  parameters: Object
  windows: { [key: string]: WindowClass }
  export: any[]
  import: { [key: string]: any }
  context: PluginContext
  users: Array<PluginClass>
  dependencies: Array<PluginClass>
  isMounted: boolean
  menu: any

  constructor(name: string, context: PluginContext) {
    this.name = name
    this.context = context
  }
  setup(desc: { [key: string]: any }, parameters: { [key: string]: any }) {
    this.parameters = parameters
    this.component = desc.component || PluginInstance
    this.export = desc.export
    this.menu = desc.menu

    // Setup dependencies
    if (desc.dependencies) {
      for (const name of desc.dependencies) {
        this.addDependency(name)
      }
    }
    if (desc.import) {
      this.import = desc.import
      for (const name in desc.import) {
        this.addDependency(name)
      }
    }

    // Setup windows
    if (desc.windows) {
      for (const name in desc.windows) {
        if (!this.windows) this.windows = {}
        const window = new WindowClass(name, desc.windows[name], this)
        for (const key in window.parameters) {
          const reference = window.parameters[key]
          const { pluginName, path } = this.resolveValueReference(reference, key)
          if (pluginName) window.addLink(pluginName, key, path)
          else console.error("Parameter '" + key + "' of window '" + window.name + "' has invalid link:", path)
        }
        this.windows[name] = window
      }
      this.addDependency("windows-frame")
    }
  }
  addUser(user: PluginClass) {
    if (!this.users) this.users = []
    this.users.push(user)
    return this
  }
  addDependency(name: string) {
    const pluginClass = this.context.mapPlugin(name)
    if (!this.dependencies) this.dependencies = []

    const deps = this.dependencies
    for (let i = 0; i < deps.length; i++) {
      if (deps[i] === pluginClass) return
    }
    deps.push(pluginClass)
    return pluginClass.addUser(this)
  }
  raiseInvalid() {
    let msg = "The plugin '" + this.name + "' is invalid or missing"
    if (this.users) {
      msg += ", check dependencies at:"
      for (const user of this.users) {
        msg += "\n > plugin '" + user.name + "'"
      }
    }
    throw new Error(msg)
  }
  mount() {
    if (!this.instance) {
      if (!this.component) this.raiseInvalid()

      // Create instance
      this.instance = new (this.component)(this)
      this.context.plugins[this.name] = this.instance

      // Call will mount
      this.instance.pluginWillMount(this.parameters)

      // Mount all dependencies
      if (this.dependencies) {
        for (const dep of this.dependencies) {
          dep.mount()
        }
      }

      // Notify all user plugins
      if (this.users) {
        for (const user of this.users) {
          user.promptMount()
        }
      }

      // Try to finalize mounting
      this.promptMount()
    }
  }
  promptMount() {
    if (this.instance && !this.isMounted) {
      const deps = this.dependencies
      if (deps) {
        for (let i = 0; i < deps.length; i++) {
          if (!deps[i].instance) return
        }
      }
      this.didMount()
    }
  }
  didMount() {
    if (this.instance && !this.isMounted) {

      // Process import
      for (const name in this.import) {
        const ref = this.import[name]
        const plugin = this.context.plugins[name]
        const pluginExport = plugin[".class"].export
        if (pluginExport) {
          if (ref === true) {
            for (const key of pluginExport) {
              this.instance[key] = plugin[key]
            }
          }
          else if (typeof ref === "string") {
            this.instance[ref] = plugin
          }
        }
        else if (typeof ref === "string") {
          this.instance[ref] = plugin
        }
      }

      this.instance.pluginDidMount({})
      this.isMounted = true
    }
  }
  resolveValueReference(reference: boolean | string, key: string) {
    let pluginName, path
    if (reference === true) {
      pluginName = this.name
      path = key
    }
    else if (typeof reference === "string") {
      const parts = reference.split("/")
      if (parts.length > 1) {
        pluginName = parts[0] ? parts[0] : this.name
        path = parts[1]
      }
      else {
        pluginName = this.name
        path = reference
      }
    }
    return { pluginName, path }
  }
}

export class PluginInstance extends Listenable {
  ".class": PluginClass
  openWindow: Function
  closeWindow: Function
  closeAllWindow: Function

  // Life Cycle management functions
  pluginWillMount(parameters: { [key: string]: any }) { }
  pluginDidMount(parameters: { [key: string]: any }) { }
  pluginWillUnmount() { }

  constructor(pluginClass: PluginClass) {
    super()
    this[".class"] = pluginClass
    if (pluginClass.windows) {
      this.openWindow = function (windowName: string, options: Object) {
        Application.layout.openPluginWindow(pluginClass.windows[windowName], this, options)
      }
      this.closeWindow = function (windowName: string) {
        Application.layout.closePluginWindows(pluginClass.windows[windowName], this)
      }
      this.closeAllWindow = function () {
        Application.layout.closePluginWindows(null, this)
      }
    }
  }
}
