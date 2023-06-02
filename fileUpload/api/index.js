import request from '@/utils/request';

export function getStatus(params) {
  return request({
    url: '/api/getStatue',
    method: 'get',
    params
  });
}

export function upload(params) {
  return request({
    url: '/api/upload',
    method: 'post',
    data: params
  });
}

export function merge(params) {
  return request({
    url: '/api/merge',
    method: 'get',
    params
  });
}