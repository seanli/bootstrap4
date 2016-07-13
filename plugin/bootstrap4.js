// npm
const fs =    Plugin.fs
const path =  Plugin.path
const sass =  Npm.require('node-sass')


// Paths and filenames
const assetsPath =        path.join('assets')
const defaultsPath =      path.join(assetsPath, 'defaults')
const scssPath =          path.join(assetsPath, 'bootstrap', 'scss')
const jsPath =            path.join(assetsPath, 'bootstrap', 'js', 'src')
const tetherJsPath =      path.join(assetsPath, 'tether', 'dist', 'js', 'tether.js')

const jsLoadFirst = [ // Specifies which js modules should be loaded first due to other js modules depending on them
  'util.js',
  'tooltip.js'
]

const bootstrapSettings =   'bootstrap-settings.json'
const bootstrapVariables =  '_bootstrap-variables.scss'
const bootstrapRaw =        'bootstrap-raw.scss'
const bootstrapMixins =     '_bootstrap-mixins.scss'
const bootstrapJs =         'bootstrap.js'

const variablesFilesInstruction =
`// These are custom bootstrap variables for you to edit.
// These simply override any default bootstrap variables.
// This means that you may delete anything in this file
// and the default bootstrap values will be used instead.
`

const mixinFilesInstruction =
`// Editing these mixins will not edit the mixins used by the core bootstrap modules.
// They are exposed here for your use and convenience.
// They can be imported using @import "path/to/${ bootstrapMixins.replace(/^\_(.+)\.scss*/, '$1') }'
`

const rawFileInstruction =
`
// DO NOT EDIT THIS FILE, CHANGES _WILL_ BE OVERWRITTEN
// This file was generated and exposed per your settings in ${ bootstrapSettings }.

`



// Asset functions
const getAsset = _bootstrapGetAsset
const getJsFilenames = _bootstrapGetJsList



// Register the compiler for the bootstrap-settings json file
Plugin.registerCompiler({
  extensions: [],
  filenames: [bootstrapSettings, bootstrapVariables, bootstrapMixins]
}, () => new BootstrapCompiler)


// BootstrapCompiler class
class BootstrapCompiler {
  // Actual processing of file (bootstrap-settings json)
  processFilesForTarget(filesFound) {
    let settingsFile

    // Loop through and find the settings file
    for (let file of filesFound) {
      let fn = path.basename(path.join('.', file.getDisplayPath()))
      if (fn === bootstrapSettings) {
        if (settingsFile)
          throw new Error('You cannot have more than one ' + bootstrapSettings + ' in your Meteor project.')

        settingsFile = file
      }
    }

    if (settingsFile) {
      // (1) Get the bootstrap-settings json

      // Flag the settings file as being present so a warning isn't displayed later
      settingsFile.addJavaScript({
        data: 'Meteor._bootstrapSettingsFileLoaded = true;\n',
        path: path.join('client', 'lib', 'settings-file-checked.generated.js'),
        bare: true
      })


      // Get the settings file dir
      const settingsFilePath = path.join('.', resolveFilePath(`{${ settingsFile.getPackageName() || '' }}/${ settingsFile.getPathInPackage() }`))
      const settingsPathDir = path.dirname(settingsFilePath)


      // Function to build the default settings json
      function buildSettingsFileJson() {
        // Load in the template settings file
        let src = getAsset(path.join(defaultsPath, 'bootstrap-settings.default.json'))


        // Get the default trailing whitespace
        const scssWhitespace = src.match(/\n(\s*)\/\*SCSS_MODULES\*\//)[1] || ''
        const jsWhitespace = src.match(/\n(\s*)\/\*JS_MODULES\*\//)[1] || ''


        // Get all scss modules specified in default bootstrap.scss
        let bootstrapDefaultScss = getAsset(path.join(scssPath, 'bootstrap.scss'))
        let scssModules = []
        let re = /\@import\s+\"(.+)\"\;?/g;
        let found
        while (found = re.exec(bootstrapDefaultScss)) {
          if (found[1]) scssModules.push(found[1])
        }


        // Remove default variables module and mixins module
        scssModules.splice(scssModules.indexOf('variables'), 1)
        scssModules.splice(scssModules.indexOf('mixins'), 1)


        // Sort them alphabetically
        scssModules.sort()


        // Get all js modules
        let jsModules = getJsFilenames()


        // Create scss and js modules json
        let scssJson = scssModules.map(name => `${ scssWhitespace } "${ name }": true`).join(',\n')
        let jsJson = jsModules.map(name => `${ jsWhitespace }"${ name.match(/(.*)\.js/i)[1] }": true`).join(',\n')


        // Insert the json modules into the template settings file
        src = src.replace(/\n\s*\/\*SCSS_MODULES\*\//, '\n' + scssJson)
                 .replace(/\n\s*\/\*JS_MODULES\*\//, '\n' + jsJson)

        return src
      }


      // Get the settings data
      const settingsContents = settingsFile.getContentsAsString()
      let settings
      if (settingsContents.trim()) {
        settings = JSON.parse(settingsContents)
      } else {
        // Populate the settings json file because it empty
        let src = buildSettingsFileJson()

        fs.writeFileSync(settingsFilePath, src)

        settings = JSON.parse(src)
      }


      // Detect huttonr:bootstrap3 upgrade
      if (settings.less) {
        // Overwrite the old settings json file with the default one
        let src = buildSettingsFileJson()

        fs.writeFileSync(settingsFilePath, src)

        settings = JSON.parse(src)
      }


      // Settings defaults
      function def(obj, name, val) { if (obj[name] === undefined) obj[name] = val }

      def(settings, 'scss', {})
      def(settings, 'javascript', {})
      def(settings, 'version', 0)
      def(settings.scss, 'enableFlex', false)
      def(settings.scss, 'customVariables', false)
      def(settings.scss, 'exposeMixins', false)
      //def(settings.scss, 'compile', true)
      def(settings.scss, 'modules', {})
      def(settings.javascript, 'namespace', false)
      def(settings.javascript, 'expose', false)
      def(settings.javascript, 'compileExposed', false)
      def(settings.javascript, 'modules', {})


      // Handle the namespace
      if (!settings.javascript.namespace ||
          settings.javascript.namespace === 'false' ||
          !_.isString(settings.javascript.namespace) ||
          !/^[a-zA-Z_$][0-9a-zA-Z_$]*$/.test(settings.javascript.namespace)) {

        settings.javascript.namespace = false
      }
      else if (settings.javascript.namespace.toLowerCase() === 'global') {
        settings.javascript.namespace = 'window'
      }




      // (2) Handle the scss

      // Get all scss modules specified in default bootstrap.scss
      // This will give a nicely ordered list of all bootstrap modules
      let bootstrapDefaultScss = getAsset(path.join(scssPath, 'bootstrap.scss'))
      let scssModules = []
      let re = /\@import\s+\"(.+)\"/g
      let found
      while (found = re.exec(bootstrapDefaultScss)) {
        if (found[1]) scssModules.push(found[1])
      }


      // Remove default variables module and mixins module
      scssModules.splice(scssModules.indexOf('variables'), 1)
      scssModules.splice(scssModules.indexOf('mixins'), 1)


      // Filter the modules to include only those enabled in the bootstrap-settings json
      scssModules = scssModules.filter(moduleName => settings.scss.modules[moduleName])


      // Reinsert default variables and mixins modules
      scssModules.splice(0, 0, 'variables', 'mixins')


      // Insert custom variables module (after default variables module)
      if (settings.scss.customVariables) {
        if (!fs.existsSync(path.join(settingsPathDir, bootstrapVariables))) {
          // Generate the custom variables file because it doesn't exist
          let src = getAsset(path.join(scssPath, '_variables.scss'))
          src = src.substr(Math.max(src.indexOf('\n\n'), 0)) // Cut the top commentary off
                   .replace(/\s*\!default/g, '')
          src = variablesFilesInstruction + src

          fs.writeFileSync(path.join(settingsPathDir, bootstrapVariables), src)
        }

        scssModules.splice(scssModules.indexOf('variables') + 1, 0, bootstrapVariables.replace(/_(.+)\.scss/, '$1'))
      }


      // Expose mixins if specified
      if (settings.scss.exposeMixins && !fs.exists(path.join(settingsPathDir, bootstrapMixins))) {
        // Generate the mixins file because it doesn't exist
        let src = getAsset(path.join(scssPath, '_mixins.scss'))
        src = src.substr(Math.max(src.indexOf('\n\n'), 0))
                 .replace(/\@import\s+\"mixins\/(.+)\"\;?/g, (match, mixin) =>
          getAsset(path.join(scssPath, 'mixins', `_${ mixin }.scss`))
        )
        src = mixinFilesInstruction + src

        fs.writeFileSync(path.join(settingsPathDir, bootstrapMixins), src)
      }


      // Enable flex if specified
      let scssPrefix = ''
      if (settings.scss.enableFlex) scssPrefix += '$enable-flex: true;\n'


      // Render the scss into css using a custom importer
      let rendered = sass.renderSync({
        data: scssPrefix + _.map(scssModules, fn => { return '@import "' + fn + '";'; }).join('\n'),
        importer: (url, prev, done) => {
          // I will admit that this regexp could have more possible cases, but this works for the current bootstrap
          url = url.replace(/(.*)(?:\/|^)(?!.+\/)(.+)/, (match, dir, fn) => path.join(dir, '_' + fn + '.scss'))

          // XXX There is a pitfall here which is that a mixin could possibly import something in the future,
          //     in which case it would not know to look in the mixin folder, but would look in the scss folder
          //     however this is not currently the case so we're not going to worry about it yet.

          // So let's try two potential locations
          try {
            // First the bootstrap scss location (asset)
            return { contents: getAsset(path.join(scssPath, url)) }
          }
          catch (err) {
            // Second the directory the bootstrap settings file is in (in the actual meteor project)
            return { file: path.join(settingsPathDir, url) }
          }
        }
      });


      // XXX There's currently no compile=false option because that would change how we import scss files


      // Add the newly generated css as a stylesheet
      settingsFile.addStylesheet({
        data: rendered.css.toString(),
        path: path.join('client', 'stylesheets', 'bootstrap', 'bootstrap.generated.css')
      });




      // (3) Handle the js

      // Get all js modules
      let jsModules = getJsFilenames()


      // Filter the modules to include only those enabled in the bootstrap-settings json
      jsModules = jsModules.filter(moduleName => settings.javascript.modules[moduleName.match(/(.*)\.js/i)[1]])


      // Push 'load first' modules to top of list
      for (let fn of jsLoadFirst.slice().reverse()) {
        let index = jsModules.indexOf(fn)

        if (index > -1)
          jsModules.unshift(jsModules.splice(index, 1)[0])
      }


      // Get source from each bootstrap js file and compile it into one file
      let src = ''
      for (let moduleFn of jsModules) {
        src += getAsset(path.join(jsPath, moduleFn)) + '\n'
      }


      // Kill the imports
      src = src.replace(/import\s+(?:\S+)\s+from\s+\'.+\'/g, '')


      // Add in tether if tooltips is specified
      if (jsModules.indexOf('tooltip.js') >= 0) {
        src = `if (typeof window.Tether === "undefined") {
                 ${ getAsset(tetherJsPath) }
               }

               ${ src.replace('window.Tether === undefined', 'typeof Tether === "undefined"')}`
      }


      // Build the "exports"
      if (settings.javascript.namespace !== false) {
        src = `if (typeof window. ${ settings.javascript.namespace } === "undefined")
                 window. ${ settings.javascript.namespace } = {};
                 ${ src }`;

        src = src.replace(
          /export\s+default\s+(\S+)/g,
          `window.${ settings.javascript.namespace }.$1 = $1`
        );
      }

      // Add guard to ensure bootstrap js only runs on the client (and pretty it up in case it gets exposed)
      src =  `if (Meteor.isClient) { \
                \n  ${ src.replace(/\n/g, '\n  ') } \
              \n}\n`


      // Babel compile function
      function compileJs(src, filename) {
        let babelOptions = Babel.getDefaultOptions()

        babelOptions.sourceMap = true
        babelOptions.filename = filename
        babelOptions.sourceFileName = path.join('/', filename)
        babelOptions.sourceMapTarget = path.join('/', filename + '.map')
        return Babel.compile(src, babelOptions) || {} // XXX Error catching would be better...
      }


      // Check if the javascript should be exposed or just added
      if (settings.javascript.expose) {
        let filename = path.join(settingsPathDir, bootstrapJs)

        // Compile it if this is specified
        if (settings.javascript.compileExposed) src = compileJs(src, filename).code

        // Add some explanatory data and warnings
        src = `${ rawFileInstruction }\n${ src }`

        // Expose the javascript into a file for the user
        fs.writeFileSync(filename, src)
      } else {
        let filename = path.join('client', 'lib', 'bootstrap', 'bootstrap.generated.js')
        let compiled = compileJs(src, filename)

        // Add the javascript directly
        settingsFile.addJavaScript({
          data: compiled.code,
          map: compiled.map,
          path: filename
        })
      }
    }
  }
}

function resolveFilePath(filePath) {
  const match = filePath.match(/{(.*)}\/(.*)$/)

  if (!match) return filePath
  if (match[1] === '') return match[2]

  let paths = []

  paths[1] = paths[0] = `packages/${ match[1].replace(':', '_') }/${ match[2] }`
  if (!fs.existsSync(paths[0]))
    paths[2] = paths[0] = `packages/${ match[1].replace(/.*:/, '') }/${ match[2] }`
  if (!fs.existsSync(paths[0]))
    throw new Error(`Path does not exist: ${ filePath }\nTested path 1: ${ paths[1] }\nTested path 2: ${ paths[2] }`)

  return paths[0]
}
