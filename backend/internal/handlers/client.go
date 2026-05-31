package handlers

import (
	"net/http"

	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type ClientHandler struct {
	db *gorm.DB
}

func NewClientHandler(db *gorm.DB) *ClientHandler {
	return &ClientHandler{db: db}
}

func (h *ClientHandler) List(c *gin.Context) {
	var clients []models.Client
	q := h.db.Model(&models.Client{})

	if search := c.Query("search"); search != "" {
		q = q.Where("name ILIKE ? OR phone ILIKE ?", "%"+search+"%", "%"+search+"%")
	}
	if country := c.Query("country"); country != "" {
		q = q.Where("country = ?", country)
	}

	if err := q.Order("created_at DESC").Find(&clients).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, clients)
}

func (h *ClientHandler) Get(c *gin.Context) {
	var client models.Client
	if err := h.db.Preload("Orders").First(&client, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "client not found"})
		return
	}
	c.JSON(http.StatusOK, client)
}

func (h *ClientHandler) Create(c *gin.Context) {
	var client models.Client
	if err := c.ShouldBindJSON(&client); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.db.Create(&client).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, client)
}

func (h *ClientHandler) Update(c *gin.Context) {
	var client models.Client
	if err := h.db.First(&client, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "client not found"})
		return
	}
	if err := c.ShouldBindJSON(&client); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.db.Save(&client)
	c.JSON(http.StatusOK, client)
}

func (h *ClientHandler) Delete(c *gin.Context) {
	if err := h.db.Delete(&models.Client{}, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}
