const express = require('express')
const cors = require('cors')
const fs = require('fs')
const path = require('path')

const app = express()

app.use(cors())
app.use(express.urlencoded({extended: false}))


const router = require('./router/fileUpload_router')
app.use('/api', router)


const rootPath = path.join('./') // 获取根目录路径
const uploadFilesFolder = path.join(rootPath, 'files') // 拼接文件夹保存路径（./files）
// 判断文件夹是否存在，不存在则创建
if (!fs.existsSync(uploadFilesFolder)) {
  fs.mkdirSync(uploadFilesFolder)
}


app.listen(8888, ()=>{
  console.log('Api server is running at http://127.0.0.1:8888');
})
