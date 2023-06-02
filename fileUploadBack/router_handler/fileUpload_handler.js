const path = require('path')
const fse = require('fs-extra')// 文件处理模块
const fs = require('fs')


const rootPath = path.join('./')
const uploadFilesFolder = path.join(rootPath, 'files')

/**
 * 
 * @param fileMd5 // 文件md5
 * @param fileName // 文件名
 * @param errChunks // 错误分片数组（可选）
 * @returns { 0/1/2 } res // 0-文件未上传  1-文件已存在  2-文件上传中断
 */
// 
exports.getStatue = async (req, res) => {
  const fileMd5 = req.query.fileMD5
  const fileName = req.query.fileName
  const errChunks = req.query.errChunks.split(',')
  if (errChunks){
    let fileFolder = path.resolve(uploadFilesFolder, fileMd5)
    //TODO: 删除该错误分片
    errChunks.map((item, index) => {
      if(fse.existsSync(path.resolve(fileFolder, item))){
        fse.unlinkSync(path.resolve(fileFolder, item))
      }
    })
  }
  // 在files文件夹创建一个新的文件夹，存放单一文件接收到的所有切片
  const chunkDir = path.resolve(uploadFilesFolder, fileMd5)
  if (!fse.existsSync(chunkDir)){
    res.send(JSON.stringify({
      status: 0,
      message: '文件状态查询成功'
    }))
    return
  } else {
    // 如果有该目录，读取目录文件，若为空返回
    fs.readdir(chunkDir, (err, data) => {
      // 排除错误
      if (err) throw new Error(err)
      if (data.includes(fileName)){
        // 文件未上传
        res.send(JSON.stringify({
          status: 1,
          message: '文件状态查询成功'
        }))
      } else {
        res.send(JSON.stringify({
          status: 2,
          doneFileList: data,
          message: '文件状态查询成功'
        }))
      }
      console.log("文件读取成功", data)// data => ['1','3.js']
    })
  }
}

/**
 * 第一种接收上传分片的方式——读本地缓存，写成新文件，删除缓存
 * @param file
 * @param chunkName
 * @param chunkIndex
 * @param name
 * @param md5
 */
exports.upload = (req, res) => {
  const chunkDir = path.resolve(uploadFilesFolder, req.body.md5)
  fse.ensureDir(chunkDir, err => {
    if (err) throw err
    let readStream = fs.createReadStream(req.files.file.path), writeStream = fs.createWriteStream(chunkDir + '/' + req.body.chunkIndex);
    console.log(req.files.file.path);
    readStream.pipe(writeStream);
    readStream.on('end', function () {
      console.log('end');
      fs.unlinkSync(req.files.file.path);// 删除缓存
      fs.readdir(chunkDir, (err, data) => {
        if (err) throw err
        res.send({
          code: 200,
          length: data.length,
          message: '分片上传写入成功'
        })
      })
    })
  })
}

/**
 * 第二种接收上传分片的方式——移动本地缓存
 * @param file
 * @param chunkName
 * @param chunkIndex
 * @param name
 * @param md5
 */
exports.upload1 = async (req, res) => {
  const file = req.files.file
  const chunkDir = path.resolve(uploadFilesFolder, req.body.md5)
  if (!fse.existsSync(chunkDir))
  { // 文件夹不存在，新建该文件夹
    await fse.mkdirs(chunkDir)
  }

  // 把切片移动进chunkDir
  await fse.move(file.path, `${chunkDir}/${req.body.chunkIndex}`)
  fs.readdir(chunkDir, (err, data) => {
    if (err) throw err
    res.send({
      code: 200,
      length: data.length,
      message: '分片上传写入成功'
    })
  })

}

/**
 * 合并分片接口
 * @param fileName
 * @param md5
 */
exports.merge = (req, res) => {
  const chunksPath = path.resolve(uploadFilesFolder, req.query.md5)
  const targetPath = path.resolve(chunksPath, req.query.fileName)
  const size = 10 * 1024 * 1024// 改大小应与前端沟通
  mergeFileChunk(targetPath, req, size).then((result) => {
    fs.stat(targetPath, (err, stats) => {
      // 不存在时，stats 为 undefined
      if (err || stats === undefined)
        res.send(JSON.stringify({
          status: 500,
          message: '文件合并写入失败'
        }))
      res.send(JSON.stringify({
        status: 200,
        message: '文件合并写入成功'
      }))
    })
  })
}

async function mergeFileChunk (filePath, req, size) {
  const chunkDir = path.resolve(uploadFilesFolder, req.query.md5)
  let chunkLists = await fse.readdir(chunkDir)
  chunkLists.sort((a, b) => a - b)
  console.log(chunkLists);
  const arr = chunkLists.map((chunkList, index) => {
    return pipeStream(
      path.resolve(chunkDir, chunkList + ''),
      // 在指定的位置创建可写流
      fse.createWriteStream(filePath, {
        start: index * size,
        end: (index + 1) * size
      })
    )
  })
  await Promise.all(arr)// 保证所有的切片都被读取
}

// 将切片转换成流进行合并
function pipeStream (path, writeStream) {
  return new Promise(resolve => {
    // 创建可读流，读取所有切片
    const readStream = fse.createReadStream(path)
    readStream.on('end', () => {
      fse.unlinkSync(path)// 读取完毕后，删除已经读取过的切片路径
      resolve('success')
    })
    readStream.pipe(writeStream)// 将可读流流入可写流
  })
}



