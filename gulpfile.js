/* eslint-disable */
'use strict';

const dir =  {
  src: './source/',
  build: './build/',
};

const fs = require('fs');
const path = require('path');
const { series, parallel, src, dest, watch } = require('gulp');
const del = require('del');
const debug = require('gulp-debug');
const plumber = require('gulp-plumber');
const pug = require('gulp-pug');
const htmlprettify = require('gulp-html-prettify');
const replace = require('gulp-replace');
const less = require('gulp-less');
const postcss = require('gulp-postcss');
const autoprefixer = require('autoprefixer');
const minify = require('gulp-csso');
const rename = require('gulp-rename');
const server = require('browser-sync').create();
const imagemin = require('gulp-imagemin');
const pump = require('pump');
const uglify = require('gulp-uglify');

// Сообщение для компилируемых файлов
let doNotEditMsg = '\n ВНИМАНИЕ! Этот файл генерируется автоматически.\n Любые изменения этого файла будут потеряны при следующей компиляции.\n\n';

function clearBuildDir() {
  return del(`${dir.build}`);
}

function copyAssets() {
  return src([
    `${dir.src}fonts/**/*.{woff,woff2,eot,ttf}`,
    `${dir.src}/img/**`
  ], {
    base: `${dir.src}`
  })
    .pipe(dest(`${dir.build}`));
}

function writePugMixinsFile(cb) {
  let doNotIncludeFiles = [
    `${dir.src.replace('./', '')}pug/layout.pug`,
    `${dir.src.replace('./', '')}pug/mixins.pug`
  ]
  let allPugFiles = findFilesInDir(`${dir.src}pug`, '.pug');

  allPugFiles = allPugFiles.filter(item => {
    if (!doNotIncludeFiles.includes(item)) {
      return item;
    }
  })
  console.log(allPugFiles);
  let pugMixins = '//-' + doNotEditMsg.replace(/\n /gm, '\n  ');
  allPugFiles.forEach(function(fileName) {
    pugMixins += `include ${fileName.replace(dir.src.replace('./', '') + 'pug/', '')}\n`;
  });
  fs.writeFileSync(`${dir.src}pug/mixins.pug`, pugMixins);
  cb();
}

function compilePug() {
  return src(`${dir.src}pages/**/*.pug`)
    .pipe(plumber({
      errorHandler: function (err) {
        console.log(err.message);
        this.emit('end');
      }
    }))
    .pipe(debug({title: 'Found pug '}))
    .pipe(pug())
    .pipe(debug({title: 'Compile pug '}))
    .pipe(htmlprettify({
      indent_char: ' ',
      indent_size: 2
    }))
    .pipe(replace(/^(\s*)(<button.+?>)(.*)(<\/button>)/gm, '$1$2\n$1  $3\n$1$4'))
    .pipe(replace(/^( *)(<.+?>)(<script>)([\s\S]*)(<\/script>)/gm, '$1$2\n$1$3\n$4\n$1$5\n'))
    .pipe(replace(/^( *)(<.+?>)(<script\s+src.+>)(?:[\s\S]*)(<\/script>)/gm, '$1$2\n$1$3$4'))
    .pipe(dest(`${dir.build}`))
    .pipe(debug({title: 'Compile html '}));
}

function compileStyles() {
  return src(`${dir.src}less/style.less`)
    .pipe(plumber({
      errorHandler: function (err) {
        console.log(err.message);
        this.emit('end');
      }
    }))
    .pipe(debug({title: 'Compiles less '}))
    .pipe(less())
    .pipe(postcss([
      autoprefixer({
        browsers: ['last 3 versions']
      })
    ]))
    .pipe(dest(`${dir.build}css`))
    .pipe(debug({title: 'Compiles css '}))
    .pipe(minify())
    .pipe(rename('style.min.css'))
    .pipe(dest(`${dir.build}css`))
    .pipe(debug({title: 'Compiles min css '}))
    .pipe(server.stream());
}

function images() {
  return src([/*`!${dir.src}img/sprite.svg`,  */`${dir.src}img/**/*.{png,jpg,svg}`])
    .pipe(imagemin([
      imagemin.optipng({optimizationLevel: 3}),
      imagemin.jpegtran({progressive: true}),
      imagemin.svgo({
        plugins: [
            {removeViewBox: false},
            {convertColors: {shorthex: false}}
        ]
      })
    ]))
    .pipe(dest(`${dir.build}img`));
}

function processJs(cb) {
  pump([
      src(`${dir.src}js/*.js`),
      uglify(),
      dest(`${dir.build}js`)
    ],
    cb
  );
}

function reload(done) {
  server.reload();
  done();
}

function serve() {
  server.init({
    // browser: 'google chrome',
    server: `${dir.build}`,
    notify: false,
    open: false,
    cors: true,
    ui: false
  });

  watch([`${dir.src}pages/**/*.pug`], { events: ['change', 'add'], delay: 100 }, series(
    compilePug,
    reload
  ));
  watch([`${dir.src}pages/**/*.pug`], { delay: 100 })
  // TODO попробовать с events: ['unlink']
    .on('unlink', function(path) {
      let filePathInBuildDir = path.replace(`${dir.src}pages/`, dir.build).replace('.pug', '.html');
      fs.unlink(filePathInBuildDir, (err) => {
        if (err) throw err;
        console.log(`---------- Delete:  ${filePathInBuildDir}`);
      });
    });
  watch([`${dir.src}pug/**/*.pug`], { events: ['change'], delay: 100 }, series(
    compilePug,
    reload
  ));
  watch([`${dir.src}pug/**/*.pug`], { events: ['add'], delay: 100 }, series(
    writePugMixinsFile,
    compilePug,
    reload
  ));
  watch([`${dir.src}pug/**/*.pug`], { events: ['unlink'], delay: 100 }, writePugMixinsFile);
  watch(`${dir.src}less/**/*.less`, compileStyles);
  watch(`${dir.src}js/*.js`, processJs);
  watch(`${dir.src}img/*`, images);
  watch([
    `${dir.build}*.html`,
    `${dir.build}js/*.js`,
    `${dir.build}img/*.{jpg,jpeg,png,svg,webp,gif}`
  ]).on('change', server.reload);
}


exports.clearBuildDir = clearBuildDir;
exports.copyAssets = copyAssets;
exports.writePugMixinsFile = writePugMixinsFile;
exports.compilePug = compilePug;
exports.compileStyles = compileStyles;
exports.images = images;
exports.processJs = processJs;


exports.build = series(
  parallel(clearBuildDir, writePugMixinsFile),
  parallel(copyAssets, compileStyles, compilePug, processJs, images)
);

exports.default = series(
  parallel(clearBuildDir, writePugMixinsFile),
  parallel(copyAssets, compileStyles, compilePug, processJs, images),
  serve
);


/**
 * Находит все файлы рекурсивно в заданной директории с заданным расширением, e.g.:
 * findFilesInDir('./project/src', '.html') ==> ['./project/src/templates/a.html','./project/src/index.html']
 * @param  {String} startPath    Путь относительно этого файла или другого файла, который требует эти файлы
 * @param  {String} filter       Расширение, e.g: '.html'
 * @return {Array}               Найденные файлы, представленные массивом строк их путей
 */
function findFilesInDir(startPath, filter) {
  let files = fs.readdirSync(startPath);
  let results = [];

  if (!fs.existsSync(startPath)) {
      console.log("no dir ", startPath);
      return;
  }

  for(let i = 0; i < files.length; i++) {
      let filename = path.join(startPath, files[i]);
      let stat = fs.lstatSync(filename);

      if (stat.isDirectory()) {
        results = results.concat(findFilesInDir(filename, filter)); //recurse
      } else if (filename.indexOf(filter) >= 0) {
        console.log('-- found: ', filename);
        results.push(filename);
      }
  }

  return results;
}
