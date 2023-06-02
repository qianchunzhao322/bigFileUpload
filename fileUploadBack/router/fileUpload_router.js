const express = require('express')
const router = express.Router()

const multipart = require('connect-multiparty');// 解析contentType: multipart/form-data
const multipartyMiddleware = multipart();

const handler = require('../router_handler/fileUpload_handler')


// 获取文件上传状态
router.get('/getStatue', handler.getStatue)
// 分片上传
router.post('/upload', multipartyMiddleware, handler.upload1)
// 分片合并
router.get('/merge', multipartyMiddleware, handler.merge)


module.exports = router