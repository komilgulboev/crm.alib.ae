import api from './client'

export interface UploadAWBResponse {
  file_key: string
  file_url: string
  content_type: string
  file_name: string
  size: number
}

export const filesApi = {
  uploadAWB: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<UploadAWBResponse>('/files/awb', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}
