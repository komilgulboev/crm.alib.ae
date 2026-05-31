package handlers

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/alib/crm/internal/storage"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FileHandler struct {
	db    *gorm.DB
	minio *storage.MinIOClient
}

func NewFileHandler(db *gorm.DB, minio *storage.MinIOClient, _ string) *FileHandler {
	return &FileHandler{db: db, minio: minio}
}

// UploadAWB — загружает файл AWB в MinIO и возвращает URL.
// Извлечение данных выполняется на клиенте через Tesseract.js.
func (h *FileHandler) UploadAWB(c *gin.Context) {
	if h.minio == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "хранилище файлов недоступно"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "файл не найден"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка чтения файла"})
		return
	}

	contentType := detectContentType(header, data)
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = contentTypeToExt(contentType)
	}

	objectKey := fmt.Sprintf("awb/%s/%s%s",
		time.Now().Format("2006/01"),
		uuid.New().String(),
		ext,
	)

	fileURL, err := h.minio.Upload(
		context.Background(),
		objectKey,
		bytes.NewReader(data),
		int64(len(data)),
		contentType,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ошибка загрузки: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"file_key":     objectKey,
		"file_url":     fileURL,
		"content_type": contentType,
		"file_name":    header.Filename,
		"size":         len(data),
	})
}

func detectContentType(header *multipart.FileHeader, data []byte) string {
	ct := header.Header.Get("Content-Type")
	if ct != "" && ct != "application/octet-stream" {
		return ct
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	switch ext {
	case ".pdf":
		return "application/pdf"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	}
	if len(data) >= 4 {
		if data[0] == '%' && data[1] == 'P' && data[2] == 'D' && data[3] == 'F' {
			return "application/pdf"
		}
		if data[0] == 0xFF && data[1] == 0xD8 {
			return "image/jpeg"
		}
		if data[0] == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G' {
			return "image/png"
		}
	}
	return "application/octet-stream"
}

func contentTypeToExt(ct string) string {
	switch {
	case strings.Contains(ct, "pdf"):
		return ".pdf"
	case strings.Contains(ct, "jpeg"):
		return ".jpg"
	case strings.Contains(ct, "png"):
		return ".png"
	}
	return ".bin"
}
