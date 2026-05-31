package handlers

import (
	"net/http"

	"github.com/alib/crm/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type UserHandler struct {
	db *gorm.DB
}

func NewUserHandler(db *gorm.DB) *UserHandler {
	return &UserHandler{db: db}
}

func (h *UserHandler) List(c *gin.Context) {
	var users []models.User
	h.db.Order("created_at DESC").Find(&users)
	c.JSON(http.StatusOK, users)
}

type createUserRequest struct {
	Name     string      `json:"name" binding:"required"`
	Email    string      `json:"email" binding:"required,email"`
	Phone    string      `json:"phone"`
	Password string      `json:"password" binding:"required,min=6"`
	Role     models.Role `json:"role" binding:"required"`
}

func (h *UserHandler) Create(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user := models.User{
		Name:  req.Name,
		Email: req.Email,
		Phone: req.Phone,
		Role:  req.Role,
	}
	if err := user.HashPassword(req.Password); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}
	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "email already exists"})
		return
	}
	c.JSON(http.StatusCreated, user)
}

func (h *UserHandler) Update(c *gin.Context) {
	var user models.User
	if err := h.db.First(&user, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var body map[string]any
	c.ShouldBindJSON(&body)

	if name, ok := body["name"].(string); ok {
		user.Name = name
	}
	if phone, ok := body["phone"].(string); ok {
		user.Phone = phone
	}
	if role, ok := body["role"].(string); ok {
		user.Role = models.Role(role)
	}
	if active, ok := body["active"].(bool); ok {
		user.Active = active
	}

	h.db.Save(&user)
	c.JSON(http.StatusOK, user)
}

func (h *UserHandler) Delete(c *gin.Context) {
	h.db.Model(&models.User{}).Where("id = ?", c.Param("id")).Update("active", false)
	c.JSON(http.StatusOK, gin.H{"message": "deactivated"})
}
