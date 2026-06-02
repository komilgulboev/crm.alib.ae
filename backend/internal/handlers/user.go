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
	Name           string      `json:"name" binding:"required"`
	Email          string      `json:"email" binding:"required,email"`
	Phone          string      `json:"phone"`
	Password       string      `json:"password" binding:"required,min=6"`
	Role           models.Role `json:"role" binding:"required"`
	TelegramChatID string      `json:"telegram_chat_id"`
}

func (h *UserHandler) Create(c *gin.Context) {
	var req createUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user := models.User{
		Name:           req.Name,
		Email:          req.Email,
		Phone:          req.Phone,
		Role:           req.Role,
		TelegramChatID: req.TelegramChatID,
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

type updateUserRequest struct {
	Name           *string      `json:"name"`
	Email          *string      `json:"email"`
	Phone          *string      `json:"phone"`
	Role           *models.Role `json:"role"`
	Active         *bool        `json:"active"`
	TelegramChatID *string      `json:"telegram_chat_id"`
	NewPassword    *string      `json:"new_password"`
}

func (h *UserHandler) Update(c *gin.Context) {
	var user models.User
	if err := h.db.First(&user, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var req updateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != nil {
		user.Name = *req.Name
	}
	if req.Email != nil {
		// Проверка уникальности email (исключая текущего пользователя)
		var count int64
		h.db.Model(&models.User{}).Where("email = ? AND id != ?", *req.Email, user.ID).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "email already exists"})
			return
		}
		user.Email = *req.Email
	}
	if req.Phone != nil {
		user.Phone = *req.Phone
	}
	if req.Role != nil {
		user.Role = *req.Role
	}
	if req.Active != nil {
		user.Active = *req.Active
	}
	if req.TelegramChatID != nil {
		user.TelegramChatID = *req.TelegramChatID
	}
	if req.NewPassword != nil && *req.NewPassword != "" {
		if len(*req.NewPassword) < 6 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 6 characters"})
			return
		}
		if err := user.HashPassword(*req.NewPassword); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
			return
		}
	}

	if err := h.db.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update user"})
		return
	}
	c.JSON(http.StatusOK, user)
}

func (h *UserHandler) Delete(c *gin.Context) {
	h.db.Model(&models.User{}).Where("id = ?", c.Param("id")).Update("active", false)
	c.JSON(http.StatusOK, gin.H{"message": "deactivated"})
}
