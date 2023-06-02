<template>
  <div class="container">
    <el-button size="small"
               @click="handleClickFile"
               type="primary">点击上传</el-button>
    <input ref="uploadFile"
           v-show="false"
           type="file"
           @input="handleChange">
    <div>大文件 <span class="bigFileC">📁</span> 分了{{ chunksCount }}片:</div>
    <!-- <div class="pieceItem"
         v-for="index in chunksCount"
         :key="index">
      <span class="a">{{ index - 1 }}</span>
      <span class="b">📄</span>
    </div> -->
    <div v-if="hashProgress">文件预检中……</div>
    <div v-if="hashProgress">计算此大文件的hash值进度</div>
    <div v-if="hashProgress === 100" class="r">结果为: {{ fileHash }}</div>
    <el-progress v-if="hashProgress" :percentage="hashProgress"></el-progress>
    <!-- <progress max="100"
              :value="hashProgress"></progress> {{ hashProgress }}% -->
    <div>
      <div v-if="fileProgress">上传文件的进度</div>
      <div class="r" v-show="fileProgress == 100">文件上传完成</div>
      <el-progress v-if="fileProgress" :percentage="fileProgress"></el-progress>
      <!-- <progress max="100" :value="fileProgress"></progress> {{ fileProgress }}% -->
      <div v-if="isMerge">文件处理中……</div>
    </div>
  </div>
</template>

<script>
import SparkMD5 from 'spark-md5'
import { getStatus, upload, merge } from '@/components/fileUpload/api/index'
export default {
  data () {
    return {
      fileList: [],
      chunksCount: 0,
      hashProgress: null,
      fileProgress: null,
      fileHash: null,
      isMerge: false
    }
  },
  methods: {
    handleClickFile () {
      this.$refs['uploadFile'].click()
    },
    // 进度函数
    progressCallbackFn (val) {
      this.hashProgress = val;
    },

    // 分片函数
    sliceFn (file, chunkSize = 10 * 1024 * 1024) {
      const result = [];
      // 开始切割，一次切割1M
      for (let i = 0; i < file.size; i = i + chunkSize)
      {
        result.push(file.slice(i, i + chunkSize));
      }
      return result;
    },
    
    // 生成文件MD5码
    // chunks：文件分好片的数组、progressCallbackFn回调函数方法，用于告知外界进度的
    // 因为文件阅读器是异步的，所以要套一层Promise方便拿到异步的计算结果
    calFileMd5Fn (chunks, progressCallbackFn) {
      return new Promise((resolve, reject) => {
        let currentChunk = 0 
        let spark = new SparkMD5.ArrayBuffer() // 实例化SparkMD5用于计算文件hash值
        let fileReader = new FileReader() // 实例化文件阅读器用于读取blob二进制文件
        fileReader.onerror = reject // 兜一下错
        fileReader.onload = (e) => {
          progressCallbackFn(Math.ceil(currentChunk / chunks.length * 100)) // 抛出一个函数，用于告知进度
          spark.append(e.target.result) // 将二进制文件追加到spark中（官方方法）
          currentChunk = currentChunk + 1 // 这个读完就加1，读取下一个blob
          // 若未读取到最后一块，就继续读取；否则读取完成，Promise带出结果
          if (currentChunk < chunks.length)
          {
            fileReader.readAsArrayBuffer(chunks[currentChunk])
          } else
          {
            progressCallbackFn(100)
            resolve(spark.end()) // resolve出去告知结果 spark.end官方api
          }
        }
        // 文件读取器的readAsArrayBuffer方法开始读取文件，从blob数组中的第0项开始
        fileReader.readAsArrayBuffer(chunks[currentChunk])
      })
    },

    // change事件--获取要上传的文件状态并进行相应下一步
    async handleChange () {
      console.log(new Date().getTime());
      const fileList = this.$refs['uploadFile'].files
      const file = {
        raw: fileList[0],
        type: fileList[0].type,
        name: fileList[0].name,
        size: fileList[0].size
      }
      let spark = new SparkMD5.ArrayBuffer() // 实例化spark-md5
      let fileReader = new FileReader() // 实例化文件阅读器
      fileReader.onload = (e) => {
        spark.append(e.target.result) // 添加到spark算法中计算
        let hash = spark.end() // 计算完成得到hash结果
      }
      fileReader.readAsArrayBuffer(file.raw) // 开始阅读这个文件，阅读完成触发onload方法
      // 转字节流
      let blob = new Blob([file.raw], { type: file.type })
      const chunks = this.sliceFn(blob)
      this.chunksCount = chunks.length
      const hash = await this.calFileMd5Fn(chunks, this.progressCallbackFn)
      this.fileHash = hash
      getStatus({ fileMD5: hash, fileName: file.raw.name, errChunks: localStorage.getItem('errChunks')|| null }).then((res) => {
        // 当随错误分片传递过去，删除本地
        localStorage.removeItem('errChunks')
        let doneFileList = null
        if(res.doneFileList){
          doneFileList= res.doneFileList.map((item) => {
            return item * 1 // 后端给到的是字符串索引，这里转成数字索引
          })
        }
        let filterChunks = []
        if (res.status === 1)
        {
          // TODO: 文件已存在，直接100%（秒传）
          this.fileProgress = 100
          this.$message.success('文件上传成功')
        } else if (res.status === 0)
        {
          //TODO: 文件不存在
          filterChunks = this.fileNoneTurnFormData(res, chunks, file.name, hash)
          this.uploadChunks(hash, file.raw.name, filterChunks, chunks)
        } else if (res.status === 2)
        {
          //TODO: 文件存在，需要断点上传
          filterChunks = this.breakPointTurnFormData(doneFileList, chunks, file.name, hash)
          this.uploadChunks(hash, file.raw.name, filterChunks, chunks)
        }
      })
      this.$refs['uploadFile'].value = null
    },

    // 断点续传情况封装每个分片请求
    breakPointTurnFormData(doneFileList, chunks, fileName, fileMd5){
      console.log(doneFileList);
      let formDataList = []
      chunks.map((item,index) => {
        return {
          blob:item,
          isUpload:doneFileList.includes(index)
        }
      }).map((item, index) => {
        if(!item.isUpload){
          let formData = new FormData();
          formData.append("file", item.blob);
          formData.append("chunksNum", chunks.length);
          formData.append("chunkIndex", index);
          formData.append("name", fileName);
          formData.append("md5", fileMd5);
          formDataList.push(formData)
        }
        })
      return formDataList
    },

    // 文件不存在的情况下封装每个分片请求
    fileNoneTurnFormData (res, chunks, fileName, fileMd5) {
        let formDataList = []
        chunks.map((item, index) => {
          // 后端接参大致有：文件片、文件分的片数、每次上传是第几片(索引)、文件名、此完整大文件hash值
          let formData = new FormData();
          formData.append("file", item); // 使用FormData可以将blob文件转成二进制binary
          formData.append("chunksNum", chunks.length);
          formData.append("chunkIndex", index);
          formData.append("name", fileName);
          formData.append("md5", fileMd5);
          formDataList.push(formData)
        })
        return formDataList
    },

    // 上传分片
    uploadChunks(md5, fileName, formDataList, chunks){
      const requestList = formDataList.map(async (item, index) => {
        console.log(item);
        const res = await upload(item)
        // 每上传完毕一片文件，后端告知已上传了多少片
        this.fileProgress = Math.ceil((res.length / chunks.length) * 100)
        return res
      })
      //!使用allSettled发请求好一些，挂了的就挂了，不影响后续不挂的请求
      Promise.allSettled(requestList).then((many) => {
        console.log('many',many);
        let errChunks = []
        many.forEach((item,index) => {
          if(item.status === 'rejected'){
            errChunks.push(index)
          }
        })
        if(errChunks.length === 0){
          if(this.fileProgress === 100){
            // 发送合并请求
            this.isMerge = true
            merge({md5,fileName}).then((res) => {
              console.log(res);
              this.$message.success('文件上传成功')
              this.isMerge = false
              console.log(new Date().getTime());
            })
          }else {
            // 提示发送有问题重发---怪问题（刷新会导致）
            this.$message.warning('文件上传中途发生异常，请稍后联系管理员')
          }
        }else{
          this.$message.warning('上传过程受网络波动造成文件损坏，请重新上传')
          console.log(errChunks);
          // TODO: 通知后端删除该分片
          // 当是断网的情况下，需要先存到locolhost然后随下一次文件重传通知后端先删除该分片并接收
          localStorage.setItem('errChunks', errChunks)
        }
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.container {
}
</style>
